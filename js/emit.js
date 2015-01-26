var Emit;
(function (Emit) {
    'use strict';

    function noop() {};

    var slice = Array.prototype.slice;

    function async(callback) {
        Promise.resolve().then(callback);
    }

    function hasMethod(name, obj) {
        return obj && typeof obj[name] === 'function';
    }
    var isThenable = hasMethod.bind(null, 'then');
    var isSequence = hasMethod.bind(null, 'forEach');

    var toFilter = typeof Sequences !== 'undefined' ?
        Sequences.toFilter :
        function (f) { return f; };

    function join(args, isReady) {
        var emitters = args.length === 1 ? args[0] : slice.call(args, 0);
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
            value: Object.create(Object.getPrototypeOf({}), {
                isEmitter: {
                    value: true
                },
                forEach: {
                    writable: true,
                    value: function (callback, report) {
                        callback || (callback = noop);
                        report || (report = function (e) { throw e; });
                        this._pump(function* () {
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
                then: {
                    writable: true,
                    value: function () {
                        return this.forEach.apply(this, arguments);
                    }
                },
                match: {
                    writable: true,
                    value: function (matchers) {
                        this._pump(function* () {
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
                filter: {
                    writable: true,
                    value: function (filter) {
                        var match = this.match.bind(this);
                        return Emit.create(function (notify, rethrow) {
                            match([{
                                match: filter.isEmitter ? filter.latest : toFilter(filter),
                                next: notify,
                                'throw': rethrow
                            }]);
                        });
                    }
                },
                map: {
                    writable: true,
                    value: function (selector) {
                        var callback = typeof selector === 'function' ?
                            selector :
                            function () { return selector; };
                        var pump = this._pump;
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
                    writable: true,
                    value: function (filter) {
                        var callback = filter.isEmitter ? filter.didEmit : toFilter(filter);
                        var pump = this._pump;
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
                head: {
                    writable: true,
                    value: function (number) {
                        number = typeof number === 'undefined' ? 1 : Number(number);
                        var counter = 0;
                        return this.until(function () { return ++counter > number; });
                    }
                },
                delay: {
                    writable: true,
                    value: function (duration) {
                        var pump = this._pump;
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
                    writable: true,
                    value: function () {
                        var pump = this._pump;
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
                    writable: true,
                    value: function () {
                        var pump = this._pump;
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
                },
                reduce: {
                    writable: true,
                    value: function (accumulator, seed) {
                        var pump = this._pump;
                        return Emit.create(function (notify, rethrow) {
                            pump(function* () {
                                try {
                                    var result = seed;
                                    while (true) {
                                        result = accumulator(result, yield);
                                        notify(result);
                                    }
                                } catch (e) {
                                    rethrow(e);
                                }
                            });
                        });
                    }
                },
                buffer: {
                    writable: true,
                    value: function (until, overlap) {
                        var callback = typeof until === 'number' ?
                            function (v, storage) { return storage.length >= until; } :
                            until.isEmitter ?
                                until.didEmit :
                                toFilter(until);
                        overlap || (overlap = 0);
                        var pump = this._pump;
                        return Emit.create(function (notify, rethrow) {
                            pump(function* () {
                                try {
                                    var storage = [];
                                    while (true) {
                                        var v = yield;
                                        var length = storage.push(v);
                                        if (callback(v, storage)) {
                                            notify(storage);
                                            storage = storage.slice(overlap >= 0 ? length - overlap : -overlap);
                                        }
                                    }
                                } catch (e) {
                                    rethrow(e);
                                }
                            });
                        });
                    }
                },
                didEmit: {
                    get: function () {
                        var result = false;
                        this.forEach(function () { result = true; });
                        return function () {
                            var r = result;
                            result = false;
                            return r;
                        };
                    }
                },
                latest: {
                    get: function (result) {
                        this.forEach(function (v) { result = v; });
                        return function () {
                            return result;
                        };
                    }
                },
                throttle: {
                    writable: true,
                    value: function (duration) {
                        return Emit.sync(this, Emit.interval(duration)).map(function (vs) { return vs[0]; });
                    }
                }
            })
        },
        create: {
            writable: true,
            value: function (source, done) {
                done || (done = noop);
                return Object.create(Emit.prototype, {
                    _pump: {
                        value: function pump(generator) {
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
                    }
                });
            }
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
                var emitters = arguments.length === 1 ? arguments[0] : slice.call(arguments, 0);
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
                var args = slice.call(arguments, 0);
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
