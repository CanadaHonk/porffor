// Copyright 2006-2008 the V8 project authors. All rights reserved.
// Redistribution and use in source and binary forms, with or without
// modification, are permitted provided that the following conditions are
// met:
//
//     * Redistributions of source code must retain the above copyright
//       notice, this list of conditions and the following disclaimer.
//     * Redistributions in binary form must reproduce the above
//       copyright notice, this list of conditions and the following
//       disclaimer in the documentation and/or other materials provided
//       with the distribution.
//     * Neither the name of Google Inc. nor the names of its
//       contributors may be used to endorse or promote products derived
//       from this software without specific prior written permission.
//
// THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS
// "AS IS" AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT
// LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR
// A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT
// OWNER OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL,
// SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT
// LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE,
// DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY
// THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
// (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
// OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.

// This is a JavaScript implementation of the Richards
// benchmark from:
//
//    http://www.cl.cam.ac.uk/~mr10/Bench.html
//
// The benchmark was originally implemented in BCPL by
// Martin Richards.

/**
 * The Richards benchmark simulates the task dispatcher of an
 * operating system.
 **/
function runRichards() {
  var scheduler = new Scheduler();
  scheduler_addIdleTask.call(scheduler, ID_IDLE, 0, null, COUNT);

  var queue = new Packet(null, ID_WORKER, KIND_WORK);
  queue = new Packet(queue, ID_WORKER, KIND_WORK);
  scheduler_addWorkerTask.call(scheduler, ID_WORKER, 1000, queue);

  queue = new Packet(null, ID_DEVICE_A, KIND_DEVICE);
  queue = new Packet(queue, ID_DEVICE_A, KIND_DEVICE);
  queue = new Packet(queue, ID_DEVICE_A, KIND_DEVICE);
  scheduler_addHandlerTask.call(scheduler, ID_HANDLER_A, 2000, queue);

  queue = new Packet(null, ID_DEVICE_B, KIND_DEVICE);
  queue = new Packet(queue, ID_DEVICE_B, KIND_DEVICE);
  queue = new Packet(queue, ID_DEVICE_B, KIND_DEVICE);
  scheduler_addHandlerTask.call(scheduler, ID_HANDLER_B, 3000, queue);

  scheduler_addDeviceTask.call(scheduler, ID_DEVICE_A, 4000, null);

  scheduler_addDeviceTask.call(scheduler, ID_DEVICE_B, 5000, null);

  scheduler_schedule.call(scheduler);

  if (scheduler.queueCount != EXPECTED_QUEUE_COUNT || scheduler.holdCount != EXPECTED_HOLD_COUNT) {
    var msg =
      "Error during execution: queueCount = " + scheduler.queueCount + ", holdCount = " + scheduler.holdCount + ".";
    throw new Error(msg);
  }
}

var COUNT = 1000;

/**
 * These two constants specify how many times a packet is queued and
 * how many times a task is put on hold in a correct run of richards.
 * They don't have any meaning a such but are characteristic of a
 * correct run so if the actual queue or hold count is different from
 * the expected there must be a bug in the implementation.
 **/
var EXPECTED_QUEUE_COUNT = 2322;
var EXPECTED_HOLD_COUNT = 928;

/**
 * A scheduler can be used to schedule a set of tasks based on their relative
 * priorities.  Scheduling is done by maintaining a list of task control blocks
 * which holds tasks and the data queue they are processing.
 * @constructor
 */
function Scheduler() {
  this.queueCount = 0;
  this.holdCount = 0;
  this.blocks = new Array(NUMBER_OF_IDS);
  this.list = null;
  this.currentTcb = null;
  this.currentId = null;
}

var ID_IDLE = 0;
var ID_WORKER = 1;
var ID_HANDLER_A = 2;
var ID_HANDLER_B = 3;
var ID_DEVICE_A = 4;
var ID_DEVICE_B = 5;
var NUMBER_OF_IDS = 6;

var KIND_DEVICE = 0;
var KIND_WORK = 1;

/**
 * Add an idle task to this scheduler.
 * @param {int} id the identity of the task
 * @param {int} priority the task's priority
 * @param {Packet} queue the queue of work to be processed by the task
 * @param {int} count the number of times to schedule the task
 */
function scheduler_addIdleTask(id, priority, queue, count) {
  scheduler_addRunningTask.call(this, id, priority, queue, new IdleTask(this, 1, count));
};

/**
 * Add a work task to this scheduler.
 * @param {int} id the identity of the task
 * @param {int} priority the task's priority
 * @param {Packet} queue the queue of work to be processed by the task
 */
function scheduler_addWorkerTask(id, priority, queue) {
  scheduler_addTask.call(this, id, priority, queue, new WorkerTask(this, ID_HANDLER_A, 0));
};

/**
 * Add a handler task to this scheduler.
 * @param {int} id the identity of the task
 * @param {int} priority the task's priority
 * @param {Packet} queue the queue of work to be processed by the task
 */
function scheduler_addHandlerTask(id, priority, queue) {
  scheduler_addTask.call(this, id, priority, queue, new HandlerTask(this));
};

/**
 * Add a handler task to this scheduler.
 * @param {int} id the identity of the task
 * @param {int} priority the task's priority
 * @param {Packet} queue the queue of work to be processed by the task
 */
function scheduler_addDeviceTask(id, priority, queue) {
  scheduler_addTask.call(this, id, priority, queue, new DeviceTask(this));
};

/**
 * Add the specified task and mark it as running.
 * @param {int} id the identity of the task
 * @param {int} priority the task's priority
 * @param {Packet} queue the queue of work to be processed by the task
 * @param {Task} task the task to add
 */
function scheduler_addRunningTask(id, priority, queue, task) {
  scheduler_addTask.call(this, id, priority, queue, task);
  tcb_setRunning.call(this.currentTcb);
};

/**
 * Add the specified task to this scheduler.
 * @param {int} id the identity of the task
 * @param {int} priority the task's priority
 * @param {Packet} queue the queue of work to be processed by the task
 * @param {Task} task the task to add
 */
function scheduler_addTask(id, priority, queue, task) {
  this.currentTcb = new TaskControlBlock(this.list, id, priority, queue, task);
  this.list = this.currentTcb;
  this.blocks[id] = this.currentTcb;
};

/**
 * Execute the tasks managed by this scheduler.
 */
function scheduler_schedule() {
  this.currentTcb = this.list;
  while (this.currentTcb != null) {
    if (tcb_isHeldOrSuspended.call(this.currentTcb)) {
      this.currentTcb = this.currentTcb.link;
    } else {
      this.currentId = this.currentTcb.id;
      this.currentTcb = tcb_run.call(this.currentTcb);
    }
  }
};

/**
 * Release a task that is currently blocked and return the next block to run.
 * @param {int} id the id of the task to suspend
 */
function scheduler_release(id) {
  var tcb = this.blocks[id];
  if (tcb == null) return tcb;
  tcb_markAsNotHeld.call(tcb);
  if (tcb.priority > this.currentTcb.priority) {
    return tcb;
  } else {
    return this.currentTcb;
  }
};

/**
 * Block the currently executing task and return the next task control block
 * to run.  The blocked task will not be made runnable until it is explicitly
 * released, even if new work is added to it.
 */
function scheduler_holdCurrent() {
  this.holdCount++;
  tcb_markAsHeld.call(this.currentTcb);
  return this.currentTcb.link;
};

/**
 * Suspend the currently executing task and return the next task control block
 * to run.  If new work is added to the suspended task it will be made runnable.
 */
function scheduler_suspendCurrent() {
  tcb_markAsSuspended.call(this.currentTcb);
  return this.currentTcb;
};

/**
 * Add the specified packet to the end of the worklist used by the task
 * associated with the packet and make the task runnable if it is currently
 * suspended.
 * @param {Packet} packet the packet to add
 */
function scheduler_queue(packet) {
  var t = this.blocks[packet.id];
  if (t == null) return t;
  this.queueCount++;
  packet.link = null;
  packet.id = this.currentId;
  return tcb_checkPriorityAdd.call(t, this.currentTcb, packet);
};

/**
 * A task control block manages a task and the queue of work packages associated
 * with it.
 * @param {TaskControlBlock} link the preceding block in the linked block list
 * @param {int} id the id of this block
 * @param {int} priority the priority of this block
 * @param {Packet} queue the queue of packages to be processed by the task
 * @param {Task} task the task
 * @constructor
 */
function TaskControlBlock(link, id, priority, queue, task) {
  this.link = link;
  this.id = id;
  this.priority = priority;
  this.queue = queue;
  this.task = task;
  if (queue == null) {
    this.state = STATE_SUSPENDED;
  } else {
    this.state = STATE_SUSPENDED_RUNNABLE;
  }
}

/**
 * The task is running and is currently scheduled.
 */
var STATE_RUNNING = 0;

/**
 * The task has packets left to process.
 */
var STATE_RUNNABLE = 1;

/**
 * The task is not currently running.  The task is not blocked as such and may
 * be started by the scheduler.
 */
var STATE_SUSPENDED = 2;

/**
 * The task is blocked and cannot be run until it is explicitly released.
 */
var STATE_HELD = 4;

var STATE_SUSPENDED_RUNNABLE = STATE_SUSPENDED | STATE_RUNNABLE;
var STATE_NOT_HELD = ~STATE_HELD;

function tcb_setRunning() {
  this.state = STATE_RUNNING;
};

function tcb_markAsNotHeld() {
  this.state = this.state & STATE_NOT_HELD;
};

function tcb_markAsHeld() {
  this.state = this.state | STATE_HELD;
};

function tcb_isHeldOrSuspended() {
  return (this.state & STATE_HELD) != 0 || this.state == STATE_SUSPENDED;
};

function tcb_markAsSuspended() {
  this.state = this.state | STATE_SUSPENDED;
};

function tcb_markAsRunnable() {
  this.state = this.state | STATE_RUNNABLE;
};

/**
 * Runs this task, if it is ready to be run, and returns the next task to run.
 */
function tcb_run() {
  var packet;
  if (this.state == STATE_SUSPENDED_RUNNABLE) {
    packet = this.queue;
    this.queue = packet.link;
    if (this.queue == null) {
      this.state = STATE_RUNNING;
    } else {
      this.state = STATE_RUNNABLE;
    }
  } else {
    packet = null;
  }
  // Note: This remains a dynamic dispatch call as the task type isn't
  // known statically here.
  return this.task.run(packet);
};

/**
 * Adds a packet to the worklist of this block's task, marks this as runnable if
 * necessary, and returns the next runnable object to run (the one
 * with the highest priority).
 */
function tcb_checkPriorityAdd(task, packet) {
  if (this.queue == null) {
    this.queue = packet;
    tcb_markAsRunnable.call(this);
    if (this.priority > task.priority) return this;
  } else {
    this.queue = packet_addTo.call(packet, this.queue);
  }
  return task;
};

function tcb_toString() {
  return "tcb { " + this.task + "@" + this.state + " }";
};

/**
 * An idle task doesn't do any work itself but cycles control between the two
 * device tasks.
 * @param {Scheduler} scheduler the scheduler that manages this task
 * @param {int} v1 a seed value that controls how the device tasks are scheduled
 * @param {int} count the number of times this task should be scheduled
 * @constructor
 */
function IdleTask(scheduler, v1, count) {
  this.scheduler = scheduler;
  this.v1 = v1;
  this.count = count;
}

function idleTask_run(packet) {
  this.count--;
  if (this.count == 0) return scheduler_holdCurrent.call(this.scheduler);
  if ((this.v1 & 1) == 0) {
    this.v1 = this.v1 >> 1;
    return scheduler_release.call(this.scheduler, ID_DEVICE_A);
  } else {
    this.v1 = (this.v1 >> 1) ^ 0xd008;
    return scheduler_release.call(this.scheduler, ID_DEVICE_B);
  }
};
// Assign the run method to the prototype for dynamic dispatch in tcb_run
IdleTask.prototype.run = idleTask_run;


function idleTask_toString() {
  return "IdleTask";
};
IdleTask.prototype.toString = idleTask_toString;

/**
 * A task that suspends itself after each time it has been run to simulate
 * waiting for data from an external device.
 * @param {Scheduler} scheduler the scheduler that manages this task
 * @constructor
 */
function DeviceTask(scheduler) {
  this.scheduler = scheduler;
  this.v1 = null;
}

function deviceTask_run(packet) {
  if (packet == null) {
    if (this.v1 == null) return scheduler_suspendCurrent.call(this.scheduler);
    var v = this.v1;
    this.v1 = null;
    return scheduler_queue.call(this.scheduler, v);
  } else {
    this.v1 = packet;
    return scheduler_holdCurrent.call(this.scheduler);
  }
};
// Assign the run method to the prototype for dynamic dispatch in tcb_run
DeviceTask.prototype.run = deviceTask_run;


function deviceTask_toString() {
  return "DeviceTask";
};
DeviceTask.prototype.toString = deviceTask_toString;

/**
 * A task that manipulates work packets.
 * @param {Scheduler} scheduler the scheduler that manages this task
 * @param {int} v1 a seed used to specify how work packets are manipulated
 * @param {int} v2 another seed used to specify how work packets are manipulated
 * @constructor
 */
function WorkerTask(scheduler, v1, v2) {
  this.scheduler = scheduler;
  this.v1 = v1;
  this.v2 = v2;
}

function workerTask_run(packet) {
  if (packet == null) {
    return scheduler_suspendCurrent.call(this.scheduler);
  } else {
    if (this.v1 == ID_HANDLER_A) {
      this.v1 = ID_HANDLER_B;
    } else {
      this.v1 = ID_HANDLER_A;
    }
    packet.id = this.v1;
    packet.a1 = 0;
    for (var i = 0; i < DATA_SIZE; i++) {
      this.v2++;
      if (this.v2 > 26) this.v2 = 1;
      packet.a2[i] = this.v2;
    }
    return scheduler_queue.call(this.scheduler, packet);
  }
};
// Assign the run method to the prototype for dynamic dispatch in tcb_run
WorkerTask.prototype.run = workerTask_run;


function workerTask_toString() {
  return "WorkerTask";
};
WorkerTask.prototype.toString = workerTask_toString;

/**
 * A task that manipulates work packets and then suspends itself.
 * @param {Scheduler} scheduler the scheduler that manages this task
 * @constructor
 */
function HandlerTask(scheduler) {
  this.scheduler = scheduler;
  this.v1 = null;
  this.v2 = null;
}

function handlerTask_run(packet) {
  if (packet != null) {
    if (packet.kind == KIND_WORK) {
      this.v1 = packet_addTo.call(packet, this.v1);
    } else {
      this.v2 = packet_addTo.call(packet, this.v2);
    }
  }
  if (this.v1 != null) {
    var count = this.v1.a1;
    var v;
    if (count < DATA_SIZE) {
      if (this.v2 != null) {
        v = this.v2;
        this.v2 = this.v2.link;
        v.a1 = this.v1.a2[count];
        this.v1.a1 = count + 1;
        return scheduler_queue.call(this.scheduler, v);
      }
    } else {
      v = this.v1;
      this.v1 = this.v1.link;
      return scheduler_queue.call(this.scheduler, v);
    }
  }
  return scheduler_suspendCurrent.call(this.scheduler);
};
// Assign the run method to the prototype for dynamic dispatch in tcb_run
HandlerTask.prototype.run = handlerTask_run;


function handlerTask_toString() {
  return "HandlerTask";
};
HandlerTask.prototype.toString = handlerTask_toString;


/* --- *
 * P a c k e t
 * --- */

var DATA_SIZE = 4;

/**
 * A simple package of data that is manipulated by the tasks.  The exact layout
 * of the payload data carried by a packet is not importaint, and neither is the
 * nature of the work performed on packets by the tasks.
 *
 * Besides carrying data, packets form linked lists and are hence used both as
 * data and worklists.
 * @param {Packet} link the tail of the linked list of packets
 * @param {int} id an ID for this packet
 * @param {int} kind the type of this packet
 * @constructor
 */
function Packet(link, id, kind) {
  this.link = link;
  this.id = id;
  this.kind = kind;
  this.a1 = 0;
  this.a2 = new Array(DATA_SIZE);
}

/**
 * Add this packet to the end of a worklist, and return the worklist.
 * @param {Packet} queue the worklist to add this packet to
 */
function packet_addTo(queue) {
  this.link = null;
  if (queue == null) return this;
  var peek,
    next = queue;
  while ((peek = next.link) != null) next = peek;
  next.link = this;
  return queue;
};


function packet_toString() {
  return "Packet";
};
Packet.prototype.toString = packet_toString;


const start = performance.now();
for (let i = 0; i < 100; i++) {
  runRichards();
}

console.log(performance.now() - start);
