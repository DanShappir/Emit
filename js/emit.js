var Emit;
(function (Emit) {
    'use strict';

    function noop() {};

    function async(callback) {
        Promise.resolve().then(callback);
    }

    function isThenable(v) {
        return v && typeof v.then === 'function';
    }
    function isSequence(v) {
        return v && typeof v.forEach === 'function';
    }

    function create(source, done) {
        var toFilter = typeof Sequences !== 'undefined' ?
            Sequences.toFilter :
            function (f) { return f; };
        done || (done = noop);

        function pump(generator) {
            var iterator = generator();

            function notify(v) {
                var r = iterator.next(v);
                if (r.done) {
                    done(notify);
                }
            }

            source(notify, function exception(e) {
                iterator.throw(e);
                done(notify);
            });
            iterator.next();
        }

        return Object.create(Emit.prototype, {
            forEach: {
                value: function forEach(callback, report) {
                    callback || (callback = noop);
                    report || (report = function (e) { throw e; });
                    pump(function* () {
                        try {
                            while (true) {
                                callback(yield);
                            }
                        } catch (e) {
                            report(e);
                        }
                    });
                    return this;
                }
            },
            match: {
                value: function match(matchers) {
                    pump(function* () {
                        try {
                            while (true) {
                                var v = yield;
                                matchers.some(function (matcher) {
                                    if (matcher.match(v)) {
                                        if (typeof matcher.next === 'function') {
                                            matcher.next(v);
                                        }
                                        return true;
                                    }
                                });
                            }
                        } catch (e) {
                            matchers.forEach(function (matcher) {
                                if (typeof  matcher.throw === 'function') {
                                    matcher.throw(e);
                                }
                            });
                        }
                    });
                    return this;
                }
            },
            map: {
                value: function map(callback) {
                    return Emit.create(function (notify, rethrow) {
                        pump(function* () {
                            try {
                                var stop = false;
                                var prev = Promise.resolve();
                                while (true) {
                                    var v = yield;
                                    if (stop) {
                                        break;
                                    }
                                    v = callback(v);
                                    if (isThenable(v)) {
                                        prev = Promise.all([prev, v]);
                                        prev.then(function (vs) {
                                            notify(vs[1]);
                                        }, function (e) {
                                            stop = true;
                                            rethrow(e);
                                        });
                                    } else {
                                        notify(v);
                                    }
                                }
                            } catch (e) {
                                rethrow(e);
                            }
                        });
                    });
                }
            },
            until: {
                value: function until(filter) {
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
                    return Emit.create(function (notify, rethrow) {
                        pump(function* () {
                            try {
                                while (true) {
                                    var v = yield;
                                    if (callback(v)) {
                                        break;
                                    }
                                    notify(v);
                                }
                            } catch (e) {
                                rethrow(e);
                            }
                        });
                    });
                }
            },
            delay: {
                value: function delay(duration) {
                    return Emit.create(function (notify, rethrow) {
                        pump(function* () {
                            try {
                                while (true) {
                                    setTimeout(notify.bind(null, yield), duration);
                                }
                            } catch (e) {
                                rethrow(e);
                            }
                        });
                    });
                }
            },
            distinct: {
                value: function distinct() {
                    return Emit.create(function (notify, rethrow) {
                        pump(function* () {
                            var prev;
                            try {
                                while (true) {
                                    var v = yield;
                                    if (v !== prev) {
                                        prev = v;
                                        notify(v);
                                    }
                                }
                            } catch (e) {
                                rethrow(e)
                            }
                        });
                    });
                }
            },
            flatten: {
                value: function flatten() {
                    return Emit.create(function (notify, rethrow) {
                        pump(function* () {
                            function flat(v) {
                                if (isSequence(v)) {
                                    v.forEach(flat);
                                } else {
                                    notify(v);
                                }
                            }

                            try {
                                while (true) {
                                    flat(yield);
                                }
                            } catch (e) {
                                rethrow(e)
                            }
                        });
                    });
                }
            }
        });
    }

    function join(args, isReady) {
        var emitters = args.length === 1 ? args[0] : Array.prototype.slice.call(args, 0);
        var done = false;

        function isDone() {
            return done;
        }

        return Emit.create(function (notify, rethrow) {
            var values = emitters.map(function () { return undefined; });
            var states = emitters.map(function () { return false; });
            function update(index, value) {
                values[index] = value;
                states[index] = true;
                if (isReady(states)) {
                    notify(values.slice(0));
                }
            }
            emitters.forEach(function (emitter, index) {
                emitter.until(isDone).forEach(update.bind(null, index), rethrow);
            });
        }, function () {
            done = true;
        });
    }

    Object.defineProperties(Emit, {
        prototype: {
            value: {
                isEmitter: true,
                then: function () {
                    return this.forEach.apply(this, arguments);
                },
                filter: function (filter) {
                    var match = this.match;
                    return Emit.create(function (notify, rethrow) {
                        match([{
                            match: filter,
                            next: notify,
                            'throw': rethrow
                        }]);
                    });
                },
                head: function (number) {
                    number = typeof number === 'undefined' ? 1 : Number(number);
                    var counter = 0;
                    return this.until(function () { return ++counter > number; });
                },
                throttle: function (duration) {
                    return Emit.sync(this, Emit.interval(duration)).map(function (vs) { return vs[0]; });
                }
            }
        },
        create: {
            writable: true,
            value: create
        },
        value: {
            writable: true,
            value: function value(v) {
                return Emit.create(function (notify) {
                    if (isThenable(v)) {
                        v.then(notify, rethrow);
                    } else {
                        async(notify.bind(null, v));
                    }
                });
            }
        },
        sequence: {
            writable: true,
            value: function sequence(s) {
                return Emit.merge([s]);
            }
        },
        merge: {
            writable: true,
            value: function merge() {
                var emitters = arguments.length === 1 ? arguments[0] : Array.prototype.slice.call(arguments, 0);
                return Emit.create(function (notify, rethrow) {
                    async(function () {
                        try {
                            emitters.forEach(function (emitter) {
                                if (isSequence(emitter)) {
                                    emitter.forEach(notify, rethrow);
                                } else {
                                    notify(emitter);
                                }
                            });
                        } catch (e) {
                            rethrow(e);
                        }
                    });
                });
            }
        },
        sync: {
            writable: true,
            value: function sync() {
                return join(arguments,
                    function isReady(states) {
                        if (states.every(function (state) { return state; })) {
                            states.forEach(function (state, index, array) { array[index] = false; });
                            return true;
                        }
                        return false;
                    }
                );
            }
        },
        combine: {
            writable: true,
            value: function combine() {
                var ready = false;
                return join(arguments,
                    function isReady(states) {
                        if (ready || states.every(function (state) { return state; })) {
                            ready = true;
                            return true;
                        }
                        return false;
                    }
                );
            }
        },
        events: {
            writable: true,
            value: function events(type, element) {
                return Emit.create(function (notify) {
                    if (typeof element.on === 'function') {
                        element.on(type, notify);
                    } else {
                        element.addEventListener(type, notify, false);
                    }
                }, function (notify) {
                    if (typeof element.off === 'function') {
                        element.off(type, notify);
                    } else {
                        element.removeEventListener(type, notify, false);
                    }
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
                var args = Array.prototype.slice.call(arguments, 0);
                var id;
                return Emit.create(function (notify) {
                    id = window.setInterval.apply(window, [notify].concat(args));
                }, function () {
                    window.clearInterval(id);
                });
            }
        }
    });
}(Emit || (Emit = {})));
