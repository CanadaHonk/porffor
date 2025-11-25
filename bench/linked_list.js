class Node {
  constructor(value) {
    this.value = value;
    this.next = null;
  }
}

class LinkedList {
  constructor() {
    this.head = null;
    this.size = 0;
  }

  _append(value) {
    const node = new Node(value);
    if (!this.head) {
      this.head = node;
    } else {
      let current = this.head;
      while (current.next) {
        current = current.next;
      }
      current.next = node;
    }
    this.size++;
    return this;
  }

  _prepend(value) {
    const node = new Node(value);
    node.next = this.head;
    this.head = node;
    this.size++;
    return this;
  }

  _insertAt(value, index) {
    if (index < 0 || index > this.size) return false;

    if (index === 0) {
      this._prepend(value);
      return true;
    }

    const node = new Node(value);
    let current = this.head;
    let prev = null;
    let i = 0;

    while (i < index) {
      prev = current;
      current = current.next;
      i++;
    }

    prev.next = node;
    node.next = current;
    this.size++;
    return true;
  }

  _removeAt(index) {
    if (index < 0 || index >= this.size) return null;

    let removedNode;

    if (index === 0) {
      removedNode = this.head;
      this.head = this.head.next;
    } else {
      let current = this.head;
      let prev = null;
      let i = 0;

      while (i < index) {
        prev = current;
        current = current.next;
        i++;
      }

      removedNode = current;
      prev.next = current.next;
    }

    this.size--;
    return removedNode.value;
  }

  _get(index) {
    if (index < 0 || index >= this.size) return null;

    let current = this.head;
    let i = 0;

    while (i < index) {
      current = current.next;
      i++;
    }

    return current.value;
  }

  _indexOf(value) {
    let current = this.head;
    let index = 0;

    while (current) {
      if (current.value === value) {
        return index;
      }
      current = current.next;
      index++;
    }

    return -1;
  }

  _reverse() {
    let prev = null;
    let current = this.head;
    let next = null;

    while (current) {
      next = current.next;
      current.next = prev;
      prev = current;
      current = next;
    }

    this.head = prev;
    return this;
  }
}

// Pre-allocate all nodes and list to avoid allocation during benchmark
const nodes = [];
for (let i = 0; i < 10; i++) {
  nodes.push(new Node(i));
}

const list = new LinkedList();

let t = Date.now();

// avoid allocations in loop
for (let i = 0; i < 400_000; i++) {
  list.head = nodes[0];
  nodes[0].next = nodes[1];
  nodes[1].next = nodes[2];
  nodes[2].next = nodes[3];
  nodes[3].next = nodes[4];
  nodes[4].next = null;
  list.size = 5;

  nodes[5].next = list.head;
  list.head = nodes[5];
  list.size++;

  nodes[6].next = nodes[2].next;
  nodes[2].next = nodes[6];
  list.size++;

  list._get(0);
  list._get(3);
  list._get(6);

  list._indexOf(5);
  list._indexOf(6);
  list._indexOf(4);

  list._removeAt(0);
  list._removeAt(2);

  list._reverse();

  for (let j = 0; j < nodes.length; j++) {
    nodes[j].next = null;
  }
}

console.log(Date.now() - t);