#!/usr/bin/env -S deno run --allow-write --allow-read --allow-net --allow-sys --allow-env --allow-run

interface TimingResult {
  initDuration: number;
  duration: number;
  billedDuration: number;
  maxMemoryUsed: number;
}

async function execCommand(command: string): Promise<{ code: number; stdout: string; stderr: string }> {
  const process = new Deno.Command("sh", {
    args: ["-c", command],
    stdout: "piped",
    stderr: "piped",
  });

  const { code, stdout, stderr } = await process.output();

  return {
    code,
    stdout: new TextDecoder().decode(stdout),
    stderr: new TextDecoder().decode(stderr),
  };
}

async function runLambdaFunction(
  functionName: string,
  iterations: number,
) {
  const benchmarkStartTime = Date.now();
  const results: TimingResult[] = [];

  console.log(`[DEBUG] Function name: ${functionName}`);
  console.log(`[DEBUG] Benchmark start time: ${benchmarkStartTime} (${new Date(benchmarkStartTime).toISOString()})`);
  console.log(`[DEBUG] Running ${iterations} iterations...`);

    for (let i = 0; i < iterations; i++) {
    try {
      // Force cold start by updating function configuration
      const timestamp = Date.now();
      const updateCmd = `aws lambda update-function-configuration --function-name ${functionName} --environment "Variables={FORCE=${timestamp}}" --region us-east-1`;

      const updateResult = await execCommand(updateCmd);
      if (updateResult.code !== 0) {
        throw new Error(`Function configuration update failed: ${updateResult.stderr}`);
      }

      // Wait for function to be ready
      await new Promise((resolve) => setTimeout(resolve, 2000));

      // Invoke function and get logs
      const invokeCmd = `aws lambda invoke --function-name ${functionName} --region us-east-1 --log-type Tail out.txt --query 'LogResult' --output text | base64 --decode`;

      const invokeResult = await execCommand(invokeCmd);
      if (invokeResult.code !== 0) {
        throw new Error(`Function invocation failed: ${invokeResult.stderr}`);
      }

      const logs = invokeResult.stdout.trim();

      // Parse metrics from logs
      let initDuration = 0;
      let duration = 0;
      let billedDuration = 0;
      let maxMemoryUsed = 0;

      const initDurationMatch = logs.match(/Init Duration: (\d+\.?\d*) ms/);
      const durationMatch = logs.match(/Duration: (\d+\.?\d*) ms/);
      const billedDurationMatch = logs.match(/Billed Duration: (\d+\.?\d*) ms/);
      const maxMemoryMatch = logs.match(/Max Memory Used: (\d+\.?\d*) MB/);

      if (initDurationMatch && durationMatch) {
        initDuration = parseFloat(initDurationMatch[1]);
        duration = parseFloat(durationMatch[1]);

        if (billedDurationMatch) {
          billedDuration = parseFloat(billedDurationMatch[1]);
        }
        if (maxMemoryMatch) {
          maxMemoryUsed = parseFloat(maxMemoryMatch[1]);
        }
      }

      if (initDuration > 0 || duration > 0) {
        const result: TimingResult = {
          initDuration,
          duration,
          billedDuration,
          maxMemoryUsed
        };

        results.push(result);
        console.log(`Iteration ${i + 1}: Init ${initDuration}ms, Duration ${duration}ms, Billed ${billedDuration}ms, Memory ${maxMemoryUsed}MB`);
      } else {
        console.log(`Iteration ${i + 1}: Failed to parse timing data`);
        results.push({ initDuration: 0, duration: 0, billedDuration: 0, maxMemoryUsed: 0 });
      }

    } catch (error) {
      console.error(`Error in iteration ${i + 1}:`, error);
    }
  }

     // Analyze results
   if (results.length === 0) {
     console.log(`[ERROR] No timing data collected. This suggests the function invocations failed.`);
     return;
   }

   console.log(`[DEBUG] Collected ${results.length} timing measurements`);

   // Filter out results with zero values (failed parsing)
   const validResults = results.filter(r => r.initDuration > 0 || r.duration > 0);
   const failedResults = results.filter(r => r.initDuration === 0 && r.duration === 0);

   if (failedResults.length > 0) {
     console.log(`[WARNING] ${failedResults.length} iterations failed to parse timing data`);
   }

   if (validResults.length === 0) {
     console.log(`[ERROR] No valid timing data found. Check if the Lambda function outputs timing information.`);
     console.log(`[DEBUG] Sample logs that failed to parse:`);
     failedResults.slice(0, 3).forEach((result, i) => {
       console.log(`[DEBUG] Iteration ${result.iteration}: No timing data found`);
     });
     return;
   }

   console.log(`[DEBUG] Valid timing measurements: ${validResults.length}`);

      // Calculate statistics for Init Duration
   const initDurations = validResults.map(r => r.initDuration).filter(d => d > 0);
   const durations = validResults.map(r => r.duration).filter(d => d > 0);

   // Check if we have Init Duration data
   if (initDurations.length === 0) {
     console.log(`[WARNING] No Init Duration data found. This suggests the function may not be experiencing cold starts.`);
   }

   // Check if we have Duration data
   if (durations.length === 0) {
     console.log(`[WARNING] No Duration data found. This suggests the function may not be outputting execution time.`);
   }

   // Calculate Init Duration statistics if available
   let initMean = 0;
   let initStddev = 0;
   if (initDurations.length > 0) {
     initMean = initDurations.reduce((acc, val) => acc + val, 0) / initDurations.length;
     initStddev = Math.sqrt(
       initDurations.reduce((acc, val) => acc + (val - initMean) ** 2, 0) / initDurations.length
     );
   }

   // Calculate Duration statistics if available
   let durationMean = 0;
   let durationStddev = 0;
   if (durations.length > 0) {
     durationMean = durations.reduce((acc, val) => acc + val, 0) / durations.length;
     durationStddev = Math.sqrt(
       durations.reduce((acc, val) => acc + (val - durationMean) ** 2, 0) / durations.length
     );
   }

   // Calculate Billed Duration statistics if available
   const billedDurations = validResults.map(r => r.billedDuration).filter(d => d > 0);
   let billedDurationMean = 0;
   let billedDurationStddev = 0;
   if (billedDurations.length > 0) {
     billedDurationMean = billedDurations.reduce((acc, val) => acc + val, 0) / billedDurations.length;
     billedDurationStddev = Math.sqrt(
       billedDurations.reduce((acc, val) => acc + (val - billedDurationMean) ** 2, 0) / billedDurations.length
     );
   }



     // Remove outliers (more than 2 standard deviations from mean)
   const filteredInitDurations = initDurations.length > 0 ? initDurations.filter(
     (duration) => Math.abs(duration - initMean) < 2 * initStddev
   ) : [];

   const filteredDurations = durations.length > 0 ? durations.filter(
     (duration) => Math.abs(duration - durationMean) < 2 * durationStddev
   ) : [];

   const filteredBilledDurations = billedDurations.length > 0 ? billedDurations.filter(
     (duration) => Math.abs(duration - billedDurationMean) < 2 * billedDurationStddev
   ) : [];



     // Output results in CSV format
   console.log("\n=== BENCHMARK RESULTS ===");
   console.log("InitDuration(ms),Duration(ms),BilledDuration(ms),MaxMemoryUsed(MB)");
   results.forEach((result) => {
     console.log(`${result.initDuration.toFixed(2)},${result.duration.toFixed(2)},${result.billedDuration.toFixed(2)},${result.maxMemoryUsed.toFixed(2)}`);
   });

   // Write CSV file
   const csvContent = "InitDuration(ms),Duration(ms),BilledDuration(ms),MaxMemoryUsed(MB)\n" +
     results.map(result =>
       `${result.initDuration.toFixed(2)},${result.duration.toFixed(2)},${result.billedDuration.toFixed(2)},${result.maxMemoryUsed.toFixed(2)}`
     ).join('\n');

   try {
     await Deno.writeTextFile('benchmark_results.csv', csvContent);
     console.log('\nCSV file saved as: benchmark_results.csv');
   } catch (error) {
     console.error('Failed to write CSV file:', error);
   }
}

const args = Deno.args;
if (args.length < 2) {
  console.error("Usage: bench.ts <function_name> <iterations>");
  console.error("Example: bench.ts hello-c 5");
  Deno.exit(1);
}

const functionName = args[0];
const iterations = parseInt(args[1], 10);
runLambdaFunction(functionName, iterations);