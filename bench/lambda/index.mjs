export const handler = async () => {
  return {
    statusCode: 200,
    headers: { "Content-Type": "text/plain" },
    body: "Hello from " + navigator.userAgent + " at " + Date()
  };
};