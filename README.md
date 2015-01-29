# Emit
Emit is a light-weight, Open Source library for [Reactive Programming](https://gist.github.com/staltz/868e7e9bc2a7b8c1f754) using JavaScript. Emit utilizes ECMAScript 6 (ES6) generators and iterators for implementing observable sequences. As a result, Emit is very concise, and easily extensible. Emit provides various operators for the observable sequences, modeled after array iteration methods. This makes it easy to use, in a way that will be familiar to most JavaScript developers.

```javascript
// Clock that updates every second, using Emit + jQuery
Emit.interval(1000).map(() => (new Date).toLocaleTimeString()).forEach((t) => $clock.text(t));
```
Emit works well with most any JavaScript library, for example jQuery. In addition, Emit works with and leverages Promises, as well as any other thenable object.  Because Emit is small and simple to use, it provides an easy way to start leveraging the benefits of Reactive programming in your JavaScript applications today.

Emit is compatible with the released versions of Chrome, Firefox and Opera. Note that the included code snippets utilize the arrow function notation, which is currently only supported by Firefox.

## Installation
Simply use [Bower](http://bower.io/):

1. Install Bower: *npm install -g bower*
2. Install the package: *bower install Emit*
3. Referrence the file: *bower_components/Emit/js/emit.js*
 
## Examples
In addition to the examples included in this repository, there are several online:

* [Sum numeirc fields at JSFiddle](http://jsfiddle.net/dansh/zLocda7m/)
* [Draw on canvas at JSFiddle](http://jsfiddle.net/dansh/s9znhzzq/)
* [Wikipedia autocomplete at JSFiddle](http://jsfiddle.net/dansh/kb1da60L/)
* [Time flies like an arrow at JSFiddle](http://jsfiddle.net/dansh/qchopp1g/)

## API
Emit functions fall into two main categories:

1. Functions in the *Emit* namespace, such as *Emit.events*
2. Methods on observable sequences, such as *filter*
 
The first category mainly provides functions for creating new observable sequences from data sources, or for combining multiple existing sequences into a single sequence. The second category provides methods for manipulating the sequence or processing its members.

## Functions in *Emit* namespace

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
If the provided value is thenable (has a *then* method) then its success value will be pushed into the observable sequence, and if it is rejected then it will be signaled as an error on the sequence.

```javascript
Emit.value(Promise.resolve('tada')).forEach((v) => console.log(v)); // output tada
```

### Emit.sequence(s)
Create a new observable sequence which contains the elements of a sequence. A sequence is a collection that impelemnts *forEach*.

**Note:** an observable sequence is itself a sequence, and can be used as an input for this function.

**Note:* you can use the [Sequences library](https://github.com/DanShappir/Sequences) to provide *forEach* for any iteretable object/collection.

### Emit.merge([s1, s2, ...]|s1, s2, ...)
Given a sequence of sequences as a single argument, or multiple sequences as several arguments, creates a new observable sequence which contains the elements of all these sequences. No order is guaranteed between the emitted elements, instead new elements are added to the output observable sequence as soon as they arrive on the input sequence.

If any one of the input sequences throws an exception, that exception will be rethrown into the output observable sequence.

```javascript
// mouseButton will emit true whenever a mouse button is pressed, and false whenever a mouse button is released
var mouseButton = Emit.merge(Emit.events('mousedown', canvas).map(true), Emit.events('mouseup', canvas).map(false));
```

### Emi.sync([s1, s2, ...]|s1, s2, ...)
Given a sequence of sequences as a single argument, or multiple sequences as several arguments, creates a new observable sequence which contains arrays as elements. Each such array contains elements from the input sequences, in order. The output is synchronized with all the input. This means a new elements will be emitted only after all the input sequences have provided new elements. As a result, if one input sequence emits two or more elements before the other sequences emit, only its last element will be used, and the others will be discarded.

If any one of the input sequences throws an exception, that exception will be rethrown into the output observable sequence.

```javascript
// seq will emit once every second
var seq = Emit.sync(Emit.interval(1000), Emit.interval(500));
```

### Emi.combine()
Given a sequence of sequences as a single argument, or multiple sequences as several arguments, creates a new observable sequence which contains arrays as elements. Each such array contains elements from the input sequences, in order. The output is a combination of all the inputs. This means a new elements will be emitted every time one of the input seqeunces provides a new element. As a result, if one input sequence emits fewer elements than the other sequences, at least some of its elements will be resued in multiple outputs.

If any one of the input sequences throws an exception, that exception will be rethrown into the output observable sequence.

```javascript
// seq will emit once every half second
var seq = Emit.sync(Emit.interval(1000), Emit.interval(500));
```

### Emit.events(type, element)
Creates an observable sequence of events objects of *type* generated by the element. Element can be either a DOM element, in which case *addEventListener* will be used to listen for events, or a jQuery-style object, in which case *on* will be used. When the events are no longer needed, the event handler will be automatically detached.

```javascript
// Generates an observable sequence of mousemove events, until the first mouseup event
var move = Emit.events('mousemove', window).until(Emit.events('mouseup', window));
```

### Emit.animationFrames()
Creates an observable sequence that emits a new timestamp to it for every animation frame event. When the events are no longer needed, the event handler will be automatically detached.

### Emit.interval(delay[, param1, param2, ...])
Creates an observable sequence that emits every *delay* period of milliseconds, using setInterval. When the events are no longer needed, the event handler will be automatically detached. If extra parameters are passed in, then the emited element will be an array containing these parameters.

## Observable Sequence Methods

### .isEmitter
Read only boolean field that contains the value *true*. Provides an easy method to check if a given object is an Emit observable sequence.

### .forEach(callback[, report])
Executes the function specified as callback for every element emitted on the observable sequence. The *callback* function is invoked with two arguments: the emitted value, and a referrence to the observable sequence. An optional *report* function can be specified, which will catch exceptions thrown on the observable sequence. If specified, *report* will be invoked with two arguments: the thrown value, and a referrence to the observable sequence.

The *forEach* method returns a referrence to the observable sequence so that it can be chained.

```javascript
// Outputs 1, 2, 3, ... one number each second
Emit.interval(1000).accumulate((r) => r + 1, 0).forEach((v) => console.log(v));
```

### .then(callback[, report])
An alias for *forEach*, this method makes observable sequences thenable.

### .match([m1, m2, ...]|m1, m2, ...)
Splits an observable sequence between multiple handlers based on matching functions. Each matcher is represnted by an object that must implement a *match* member function. This function scans the provided matchers in order, and utilize the first matcher for which the *match* member function returns a truthy value.

In addition 

### .filter(filterExpression)

### .map(selector)

### .until(filterExpression)

### .head(number)

### .delay(duration)

### .distinct()

### .flatten()

### .reduce(accumulator[, seed])

### .buffer(until[, overlap])

### .didEmit

### .latest

### .throttle(duration)
