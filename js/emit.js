var Emit;
(function (Emit) {
    'use strict';

    function create(source, done) {
        var toFilter = typeof Sequences !== 'undefined' ?
            Sequences.toFilter :
            function (f) { return f; };

        function pump(generator) {
            var iterator = generator();
            source(function notify(v) {
                var r = iterator.next(v);
                if (r.done && typeof done === 'function') {
                    done(notify);
                }
            });
            iterator.next();
        }

        return {
            isEmitter: true,

            forEach: function forEach(callback) {
                pump(function* () {
                    while (true) {
                        callback(yield);
                    }
                });
            },
            filter: function filter(filter) {
                var callback = toFilter(filter);
                return Emit.create(function (notify) {
                    pump(function* () {
                        while (true) {
                            var v = yield;
                            if (callback(v)) {
                                notify(v);
                            }
                        }
                    });
                });
            },
            map: function map(callback) {
                return Emit.create(function (notify) {
                    pump(function* () {
                        while (true) {
                            notify(callback(yield));
                        }
                    });
                });
            },
            until: function until(filter) {
                var callback;
                if (filter.isEmitter) {
                    var finished = false;
                    filter.head().forEach(function () {
                        finished = true;
                    });
                    callback = function () {
                        return finished;
                    };
                } else {
                    callback = toFilter(filter);
                }
                return Emit.create(function (notify) {
                    pump(function* () {
                        while (true) {
                            var v = yield;
                            if (callback(v)) {
                                break;
                            }
                            notify(v);
                        }
                    });
                });
            },
            head: function head(number) {
                number = typeof number === 'undefined' ? 1 : Number(number);
                return Emit.create(function (notify) {
                    pump(function* () {
                        for (var i = 0; i < number; ++i) {
                            notify(yield);
                        }
                    });
                });
            },
            sync: function sync() {
                var emitters = [this].concat(Array.prototype.slice.call(arguments));
                var done = false;

                function isDone() {
                    return done;
                }

                return Emit.create(function (notify) {
                    var results = emitters.map(function () { return { value: undefined, done: true }; });
                    function update(index, value) {
                        var result = results[index];
                        result.value = value;
                        result.done = false;
                        if (results.every(function (result) { return !result.done; })) {
                            var values = results.map(function (result) { result.done = true; return result.value; });
                            notify(values);
                        }
                    }
                    emitters.forEach(function (emitter, index) {
                        emitter.until(isDone).forEach(update.bind(null, index));
                    });
                }, function () {
                    done = true;
                });
            },
            promise: function promise(fail) {
                return new Promise(function (resolve, reject) {
                    pump(function* () {
                        (fail ? reject : resolve)(yield);
                    });
                });
            }
        };
    }

    Object.defineProperties(Emit, {
        create: {
            writable: true,
            value: create
        },
        events: {
            writable: true,
            value: function events(type, element) {
                return Emit.create(function (notify) {
                    element.addEventListener(type, notify, false);
                }, function (notify) {
                    element.removeEventListener(type, notify, false);
                });
            }
        },
        animationFrames: {
            writable: true,
            value: function animationFrames() {
                var id;
                return Emit.create(function (notify) {
                    id = window.requestAnimationFrame(function raf(timestamp) {
                        notify(timestamp);
                        id = window.requestAnimationFrame(raf);
                    });
                }, function () {
                    window.cancelAnimationFrame(id);
                });
            }
        },
        interval: {
            writable: true,
            value: function interval() {
                var args = Array.prototype.slice.call(arguments);
                var id;
                return Emit.create(function (notify) {
                    id = window.setInterval.apply(window, [notify].concat(args));
                }, function () {
                    window.clearInterval(id);
                });
            }
        },
        promise: {
            writable: true,
            value: function promise(p) {
                return {
                    resolve: Emit.create(function (notify) {
                        p.then(notify);
                    }),
                    reject: Emit.create(function (notify) {
                        p.then(null, notify);
                    })
                };
            }
        }
    });
}(Emit || (Emit = {})));
