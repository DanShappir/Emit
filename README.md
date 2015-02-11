# Emit
Emit is a light-weight, Open Source library for [Reactive Programming](https://gist.github.com/staltz/868e7e9bc2a7b8c1f754) using JavaScript. Emit utilizes ECMAScript 6 (ES6) generators and iterators for implementing observable sequences. As a result, Emit is very concise, and easily extensible. Despite its compact size, Emit provides a wide variety of operators for observable sequences, modeled after array iteration methods. This makes Emit easy to use, in a way that will be familiar to most JavaScript developers.

```javascript
// Clock that updates every second, using Emit + jQuery
Emit.interval(1000).map(() => (new Date).toLocaleTimeString()).forEach((t) => $clock.text(t));
```
Emit works well with most any JavaScript library, for example jQuery. In addition, Emit works with and leverages Promises, as well as any other thenable object.  Because Emit is small and simple to use, it provides an easy way to start leveraging the benefits of Reactive programming in your JavaScript applications.

Emit is compatible with the released versions of Chrome, Firefox and Opera. Note that the code snippets in this document utilize the arrow function notation, which is currently only supported by Firefox.

## Installation
Simply use [Bower](http://bower.io/):

1. Install Bower: *npm install -g bower*
2. Install the package: *bower install Emit*
3. Reference the file: *bower_components/Emit/js/emit.js*
 
## Examples
In addition to the examples included in this repository, there are several online examples:

* [Wikipedia autocomplete at JSFiddle](http://jsfiddle.net/dansh/kb1da60L/)
* [Draw on canvas at JSFiddle](http://jsfiddle.net/dansh/s9znhzzq/)
* [Color picker at JSFiddle](http://jsfiddle.net/dansh/5jnuorf7/)
* [Sum numeirc fields at JSFiddle](http://jsfiddle.net/dansh/zLocda7m/)
* [Time flies like an arrow at JSFiddle](http://jsfiddle.net/dansh/qchopp1g/)

## Terminology
1. Observable sequence - a sequence of events over time that behaves like a a sequence of elements in [memory] space, such as arrays. The Emit library creates and manipulates observable sequences.
2. Source / emitter - the origin (left-hand side)of an observable sequence. The source places data items into the observable sequence. The source can also throw exceptions (signal errors) on the observable sequence.
3. Consumer - the target (right-hand side) of an observable sequence. The target is automatically invoked for every data item placed into the observable sequence.

## Design and implementation notes
1. Emit is a library, not a framework. It does not mandate any usage methodology, and plays nice with other libraries and frameworks, e.g. jQuery
2. Emit is small and compact, and implements a simple yet complete API
3. Emit observable sequences are always **hot**. This means that they do not need to be explicitly enabled.
4. There is no subscribe / unsubscribe mechanism - simply attach a consumer to an observable sequence to start receiving data. Indicate that the consumer no longer requires data items using methods such as [until]() and [head]().
5. There is no notification for end-of-data on an observable sequence. Consumers only receive notifications for data and for errors (exceptions).
6. Sources for observable sequence are notified when consumers no longer require data, for example as result of using [head](). They can use this notification to release resources or detach from events.

## API
Emit functions fall into two main categories:

1. Functions in the *Emit* namespace, such as *Emit.events*
2. Methods on observable sequences, such as *filter*
 
The first category mainly provides functions for creating new observable sequences from data sources, or for combining multiple existing sequences into a single sequence. The second category provides methods for manipulating the sequence or processing its members.

## Functions in *Emit* namespace

### Emit.isEmitter(candidate)
Returns *true* if candidate is an observable sequence. Returns *false* otherwise.

### Emit.create(source[, done])
Create a new observable sequence from a data source, and returns that sequence. This API takes two functions as arguments:

1. source - called whenever an active consumer is attached to observable sequence, with a single argument which implements the *iterator* interface. Invoke the *next* method with a value to push that value into the sequence. Invoke the *throw* method with an error object to signal an error on the sequence.
2. done (optional) - called whenever a consumer is no longer active, for example as result of [until]() or [head](). The same *iterator* argument is also passed to this function.

In addition, both functions are invoked with the same context, which is initially an empty object. The functions can utilize this context to store private state information.

```javascript
// notify every second. Each consumer will utilize a distinct setInterval instance
var interval = Emit.create(function (iter) {
	this.id = window.setInterval(iter.next, 1000);
}, function () {
	window.clearInterval(this.id);
});
```

### Emit.reusable(source[, done])
Like [Emit.create]() with enhanced support for multiple concurrent consumers. *source* is invoked only when the number of active consumers goes up from 0 to 1. And *done* is called only when the number of active consumers goes back down to 0. Any value emitted will be transferred to all the active consumers.

```javascript
// notify every second. All concurrent consumers utilize a single setInterval instance
var id;
var interval = Emit.reusable(function (iter) {
	id = window.setInterval(iter.next, 1000);
}, function () {
	window.clearInterval(id);
});
```

### Emit.value(v)
Create a new observable sequence which contains a single value.

```javascript
Emit.value(42).forEach((v) => console.log(v)); // output 42
```
If the provided value is thenable (has a *then* method) then its success value will be pushed into the observable sequence, and if it is rejected then it will be signaled as an error on the sequence.

```javascript
Emit.value(Promise.resolve('tada')).forEach((v) => console.log(v)); // output tada
```

### Emit.sequence(s[, depth])
Create a new observable sequence from a sequence of items, such as an array or another observable sequence. As sequence in this context is any object which implements *forEach*. *Emit.sequence* spreads the items of the input sequence in the resulting observable sequence by internally passing the *depth* argument to [flatten](). If *depth* is not specified, a default value 0 (non recursive) is used.

```javascript
Emit.sequence([1, 2, 3]).forEach((v) => console.log(v)); // output 1, 2, 3
```

### Emit.iter()
Create a new observable sequence that also implement the ES6 iterator interface: *next* and *throw*. To emit values into the observable sequence, invoke *next* with the values as arguments. To signal an error on the sequence, call *throw* and provide the error object.

The *next* method returns an object that has a *done* property that is *true* is the observable sequence is no longer accepting elements, and *false* otherwise.

**Note:** unlike standard ES6 iterators, an observable sequence created by *Emit.iter* can revert back from *done* to *not done* when a new consumer is attached to it.

```javascript
var seq = Emit.inject().forEach((v) => console.log(v));
seq.next(42); // Outputs 42
```

### Emit.matcher(test[, until])
Create a new observable sequence that also implement the ES6 iterator interface: *next* and *throw*, and also implements a *test* method. Such an observable sequence is intended to be used as an argument for the [match]() method. The test argument can be either a function, in which case it will be attached as-is to the resulting observable sequence, or itself be an observable sequence. If the latter, then the [latest]() getter will be used to extract the last value from that sequence, and its truthiness will be used to determine the match.

If *test* is an observable sequence then a second argument *until* can be specified to control its duration.

```javascript
var matcher = Emit.matcher((v) => v % 2);
var source = Emit.iter();
Emit.match(matcher);
matcher.forEach((v) => console.log(v, 'is odd'));
source.next(7); // output "7 is odd"
source.next(8); // no output
```

### Emit.merge([s1, s2, ...] | s1, s2, ...)
Given a single argument containing an array of one or more observable sequences, or one or more observable sequences provided as distinct arguments, creates a new observable sequence which contains the elements of all these sequences. No order is guaranteed between the emitted elements, instead new elements are added to the output observable sequence as soon as they arrive on the input sequence.

If any one of the input sequences throws an exception, that exception will be rethrown into the output observable sequence.

```javascript
// mouseButton will emit true whenever a mouse button is pressed, and false whenever a mouse button is released
var mouseButton = Emit.merge(Emit.events('mousedown', canvas).map(true), Emit.events('mouseup', canvas).map(false));
```

### Emi.sync([s1, s2, ...] | s1, s2, ...)
Given a single argument containing an array of one or more observable sequences, or one or more observable sequences provided as distinct arguments, creates a new observable sequence which contains arrays as elements. Each such array contains elements from the input sequences, in order. The output is synchronized with all the input. This means a new elements will be emitted only after all the input sequences have provided new elements. As a result, if one input sequence emits two or more elements before the other sequences emit, only its last element will be used, and the others will be discarded.

If any one of the input sequences throws an exception, that exception will be rethrown into the output observable sequence.

```javascript
// seq will emit once every second
var seq = Emit.sync(Emit.interval(1000), Emit.interval(500));
```

### Emit.combine([s1, s2, ...] | s1, s2, ...)
Given a single argument containing an array of one or more observable sequences, or one or more observable sequences provided as distinct arguments, creates a new observable sequence which contains arrays as elements. Each such array contains elements from the input sequences, in order. The output is a combination of all the inputs. This means a new elements will be emitted every time one of the input sequences provides a new element. As a result, if one input sequence emits fewer elements than the other sequences, at least some of its elements will be reused in multiple outputs.

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
Creates an observable sequence that emits a new time-stamp to it for every animation frame event. When the events are no longer needed, the event handler will be automatically detached.

### Emit.interval(delay[, param1, param2, ...])
Creates an observable sequence that emits every *delay* period of milliseconds, using setInterval. When the events are no longer needed, the event handler will be automatically detached. If extra parameters are passed in, then the emitted element will be an array containing these parameters.

## Observable Sequence Methods

### .forEach(callback[, report])
Executes the function specified as callback for every element emitted on the observable sequence. The *callback* function is invoked with two arguments: the emitted value, and a reference to the observable sequence. An optional *report* function can be specified, which will catch exceptions thrown on the observable sequence. If specified, *report* will be invoked with two arguments: the thrown value, and a reference to the observable sequence.

The *forEach* method returns a reference to the observable sequence so that it can be chained.

```javascript
// Outputs 1, 2, 3, ... one number each second
Emit.interval(1000).accumulate((r) => r + 1, 0).forEach((v) => console.log(v));
```

### .match([m1, m2, ...] | m1, m2, ...)
Given a single argument containing an array of one or more matcher objects, or one or more matcher objects provided as distinct arguments, splits an observable sequence between the matchers. Each matcher object must implement a *test* member function. This method scans the provided matchers in order, and utilizes the first matcher for which *test* returns a truthy value.

To handle value, matcher needs to implement iterator-like interface, consisting of the methods *next* and *throw*. After a matcher is selected, its *next* method is invoked with the matched element as the first argument and a reference to the observable sequence as the second argument. If the matcher doesn't implement *next* then the element is discarded.

If an error is thrown on the original observable sequence, it is passed to **all** the matchers that implement the *throw* method, with the observable sequence  as the second argument.

Note that if an array of matchers is passed, it is possible to modify the array - add or remove matchers from it - after the call to *match*.

### .filter(filterExpression)
Given an observable sequence, retain only those values for which the specified *filterExpression* returns a truthy value. If *filterExpression* is a function, that function is called with the element to evaluate as the first argument, and a reference to the observable sequence  as the second argument. If *filterExpression* is itself an observable sequence, filtering is performed based on the last element it emitted. If that element had a truthy value, the elements are retained, otherwise they are discard.

If the **Sequences** library is available, [Sequences.toFilter](https://github.com/DanShappir/Sequences#sequencestofiltervalue) is applied to the *filterExpression*, enabling advanced filtering.

```javascript
// Outputs 2, 4, 6, ... one number each second
Emit.interval(1000).accumulate((r) => r + 1, 0).filter((v) => v % 2 === 0)forEach((v) => console.log(v));
```

### .map(selector)
Given an observable sequence, transform its elements by applying a mapping function, specified as the *selector*, to each element. If *selector* is a value instead of a function, all elements are transformed to that value (as if a function is used that always returns this value, regardless of the arguments passed to it.)

If a function specified as *selector* returns a thenable object, the output observable sequence will contain the result of the thenable object. Order is automatically maintained between thenable objects. If such a thenable object fails, an exception will be thrown on the created observable sequence.

```javascript
// Display tag name of HTML element user clicks on
Emit.events('click', window).map((ev) => ev.target).forEach((el) => console.log(el.tagName));
```

### .until(filterExpression)
Given an observable sequence, passes its elements until the function specified by *filterExpression* returns a truthy value. The function is invoked with two arguments: the current element, and a reference to the sequence itself. If *filterExpression* is itself an observable sequence, *until* passes elements until *filterExpression* emits an element (regardless of its value).

If the **Sequences** library is available, [Sequences.toFilter](https://github.com/DanShappir/Sequences#sequencestofiltervalue) is applied to the *filterExpression*, enabling advanced filtering.

```javascript
// Outputs 1, 2, 3 one number each second, and then stops
Emit.interval(1000).accumulate((r) => r + 1, 0).until((v) => v >= 3)forEach((v) => console.log(v));
```

### .head([number])
Given an observable sequence, passes its first *number* elements. If *number* isn't specified, it defaults to 1.

### .delay(duration)

### .distinct()

### .flatten()

### .reduce(accumulator[, seed])

### .buffer(until[, overlap])

### .didEmit

### .latest

### .throttle(duration)
