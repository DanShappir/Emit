# Emit
Emit is a light-weight, Open Source library for [Reactive Programming](https://gist.github.com/staltz/868e7e9bc2a7b8c1f754) using JavaScript. Emit utilizes ECMAScript 6 (ES6) generators and iterators for implementing observable sequences. As a result, Emit is very concise, and easily extensible. Emit provides various operators for the observable sequences, modeled after array iteration methods. This makes it easy to use, in a way that will be familiar to most JavaScript developers.

```javascript
// Clock that updates every second, using Emit + jQuery
Emit.interval(1000).map(() => (new Date).toLocaleTimeString()).forEach((t) => $clock.text(t));
```
Emit works well with most any JavaScript library, for example jQuery. In addition, Emit works with and leverages Promises, as well as any other thenable object.  Because Emit is small and simple to use, it provides an easy way to start leveraging the benefits of Reactive programming in your JavaScript applications today.

Emit is compatible with the released versions of Chrome, Firefox and Opera.

## Installation
Simply use [Bower](http://bower.io/):

1. Install Bower: *npm install -g bower*
2. Install the package: *bower install Emit*
3. Referrence the file: *bower_components/Emit/js/emit.js*
 
## Examples
In addition to the examples included in this repository, there are several online:

* [Sum numeirc fields at JSFiddle](http://jsfiddle.net/dansh/zLocda7m/)
* [Wikipedia autocomplete at JSFiddle](http://jsfiddle.net/dansh/kb1da60L/)
* [Time flies like an arrow at JSFiddle](http://jsfiddle.net/dansh/qchopp1g/)

## API
Emit functions fall into two main categories:

1. Functions in the *Emit* namespace, such as *Emit.events*
2. Methods on observable sequences, such as *filter*
 
The first category mainly provides functions for creating new observable sequences from data sources, or for combining multiple existing sequences into a single sequence. The second category provides methods for manipulating the sequence or processing its members.

### Emit.create(source[,done])
Create a new observable sequence from a data source, and returns that sequence. The function accepts two functions:

1. source - called immediatly with two arguments: *notify* and *rethrow*. Invoke *notify* with a value to push that value into the sequence. Invoke *rethrow* with an error object to signal an error on the sequence.
2. done (optional) - will be invoked when the sequence should stop generating values, e.g. it's no longer observed or an error was signalled on it.

```javascript
var interval = Emit.create((notify) => setInterval(notify, 1000)); // notify every second
```

### Emit.value(v)
Create a new observable sequence which contains a single value. Note that this is a **hot** observable, which means the value will be emitted asynchrounsly, as soon as possible.

```javascript
Emit.value(42).forEach((v) => console.log(v)); // output 42
```
If the provided value is thenable then its success value will be pushed into the observable sequence, and if it is rejected then it will be signaled as an error on the sequence.

```javascript
Emit.value(Promise.resolve('tada')).forEach((v) => console.log(v)); // output tada
```

### Emit.sequence(s)
Create a new observable sequence which contains the elements of a sequence. A sequence is a collection that impelemnts *forEach*.

**Note:** and observable sequence is itself a sequence, and can be used as an input for this function.

**Note:* you can use the [Sequences library](https://github.com/DanShappir/Sequences) to provide *forEach* for any iteretable object/collection.

### Emit.merge([s1, s2, ...]|s1, s2, ...)
Given a sequence of sequences as a single argument, or multiple sequences as several arguments, creates a new observable sequence which contains the elements of all these sequences. No order is guaranteed between the emitted elements.

### Emi.sync()

### Emi.combine()
