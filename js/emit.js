var Emit;
(function (Emit) {
    'use strict';

    function noop() {};

    function async(callback) {
        Promise.resolve().then(callback);
    }

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
            }, function exception(e) {
                iterator.throw(e);
            });
            iterator.next();
        }

        function forEach(callback, report) {
            callback || (callback = noop);
            report || (report = function (e) { throw e; });
            pump(function* () {
                while (true) {
                    try {
                        callback(yield);
                    } catch (e) {
                        report(e);
                    }
                }
            });
            return this;
        }

        return {
            isEmitter: true,

            forEach: forEach,
            then: forEach,
            match: function match(filter) {
                var callback = toFilter(filter);
                var resolved = noop;
                var resolvedRethrow = noop;
                var rejected = noop;
                var rejectedRethrow = noop;
                pump(function* () {
                    while (true) {
                        try {
                            var v = yield;
                            (callback(v) ? resolved : rejected)(v);
                        } catch (e) {
                            resolvedRethrow(e);
                            rejectedRethrow(e);
                        }
                    }
                });
                return {
                    resolved: Emit.create(function (notify, rethrow) {
                        resolved = notify;
                        resolvedRethrow = rethrow;
                    }),
                    rejected: Emit.create(function (notify, rethrow) {
                        rejected = notify;
                        rejectedRethrow = rethrow;
                    })
                };
            },
            filter: function filter(filter) {
                return this.match(filter).resolved;
            },
            map: function map(callback, fixer) {
                callback || (callback = function (v) { return v; });
                fixer || (fixer = function (e) { throw e; });
                return Emit.create(function (notify, rethrow) {
                    pump(function* () {
                        try {
                            while (true) {
                                notify(callback(yield));
                            }
                        } catch (e) {
                            try {
                                notify(fixer(e));
                            } catch (ee) {
                                rethrow(ee);
                            }
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
                return Emit.create(function (notify, rethrow) {
                    pump(function* () {
                        while (true) {
                            try {
                                var v = yield;
                                if (callback(v)) {
                                    break;
                                }
                                notify(v);
                            } catch (e) {
                                rethrow(e);
                            }
                        }
                    });
                });
            },
            head: function head(number) {
                number = typeof number === 'undefined' ? 1 : Number(number);
                return Emit.create(function (notify, rethrow) {
                    pump(function* () {
                        for (var i = 0; i < number; ++i) {
                            try {
                                notify(yield);
                            } catch (e) {
                                rethrow(e);
                            }
                        }
                    });
                });
            },
            delay: function delay(duration) {
                return Emit.create(function (notify, rethrow) {
                    pump(function* () {
                        while (true) {
                            try {
                                setTimeout(notify.bind(null, yield), duration);
                            } catch (e) {
                                rethrow(e);
                            }
                        }
                    });
                });
            }
        };
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
        create: {
            writable: true,
            value: create
        },
        value: {
            writable: true,
            value: function value(v) {
                return Emit.create(function (notify) {
                    async(notify.bind(null, v));
                });
            }
        },
        sequence: {
            writable: true,
            value: function sequence(s) {
                return Emit.create(function (notify, rethrow) {
                    async(function () {
                        try {
                            s.forEach(notify);
                        } catch (e) {
                            rethrow(e);
                        }
                    });
                });
            }
        },
        merge: {
            writable: true,
            value: function merge() {
                var emitters = arguments.length === 1 ? arguments[0] : Array.prototype.slice.call(arguments, 0);
                return Emit.create(function (notify, rethrow) {
                    emitters.forEach(function (emitter) {
                        Emit.sequence(emitter).forEach(notify, rethrow);
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
                var args = Array.prototype.slice.call(arguments, 0);
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
                return Emit.create(function (notify, rethrow) {
                    p.then(notify, rethrow);
                });
            }
        }
    });
}(Emit || (Emit = {})));
