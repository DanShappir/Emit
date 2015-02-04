var Emit;
(function (Emit) {
    'use strict';

    function noop() {};
    var slice = Array.prototype.slice;

    function hasMethod(name, obj) {
        return obj && typeof obj[name] === 'function';
    }
    var isThenable = hasMethod.bind(null, 'then');
    var isSequence = hasMethod.bind(null, 'forEach');

    function numericArg(arg, def) {
        var result = Number(arg);
        return isNaN(result) ? def : result;
    }
    function multiArgs(args) {
        return args.length === 1 ? args[0] : slice.call(args, 0);
    }

    var toFilter = typeof Sequences !== 'undefined' ?
        Sequences.toFilter :
        function (f) { return f; };

    function join(args, isReady) {
        var emitters = multiArgs(args);
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
                                    callback((yield), this);
                                }
                            } catch (e) {
                                report(e, this);
                            }
                        }.bind(this));
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
                                while (matchers.length) {
                                    var v = yield;
                                    matchers.some(function (matcher) {
                                        if (matcher.match(v, this)) {
                                            if (typeof matcher.next === 'function') {
                                                matcher.next(v, this);
                                            }
                                            return true;
                                        }
                                    });
                                }
                            } catch (e) {
                                matchers.forEach(function (matcher) {
                                    if (typeof  matcher.throw === 'function') {
                                        matcher.throw(e, this);
                                    }
                                });
                            }
                        }.bind(this));
                        return this;
                    }
                },
                filter: {
                    writable: true,
                    value: function (filter) {
                        var match = this.match.bind(this);
                        var matcher;
                        return Emit.create(function (notify, rethrow) {
                            matcher = [{
                                match: filter.isEmitter ? filter.latest : toFilter(filter),
                                next: notify,
                                'throw': rethrow
                            }];
                            match(matcher);
                        }, function () {
                            matcher.length = 0;
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
                        var proceed = true;
                        return Emit.create(function (notify, rethrow) {
                            pump(function* () {
                                try {
                                    var prev = Promise.resolve();
                                    while (proceed) {
                                        var v = yield;
                                        v = callback(v, this);
                                        if (isThenable(v)) {
                                            prev = Promise.all([prev, v]);
                                            prev.then(function (vs) {
                                                notify(vs[1]);
                                            }, function (e) {
                                                proceed = false;
                                                rethrow(e);
                                            });
                                        } else {
                                            notify(v);
                                        }
                                    }
                                } catch (e) {
                                    rethrow(e);
                                }
                            }.bind(this));
                        }, function () {
                            proceed = false;
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
                                        if (callback(v, this)) {
                                            break;
                                        }
                                        notify(v);
                                    }
                                } catch (e) {
                                    rethrow(e);
                                }
                            }.bind(this));
                        });
                    }
                },
                head: {
                    writable: true,
                    value: function (number) {
                        number = numericArg(number, 1);
                        var counter = 0;
                        return this.until(function () { return ++counter > number; });
                    }
                },
                delay: {
                    writable: true,
                    value: function (duration) {
                        var pump = this._pump;
                        var proceed = true;
                        return Emit.create(function (notify, rethrow) {
                            pump(function* () {
                                try {
                                    while (proceed) {
                                        setTimeout(function () {
                                            if (proceed) {
                                                notify(this);
                                            }
                                        }.bind(yield), duration);
                                    }
                                } catch (e) {
                                    rethrow(e);
                                }
                            });
                        }, function () {
                            proceed = false;
                        });
                    }
                },
                distinct: {
                    writable: true,
                    value: function () {
                        var pump = this._pump;
                        var proceed = true;
                        return Emit.create(function (notify, rethrow) {
                            pump(function* () {
                                var prev;
                                try {
                                    while (proceed) {
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
                        }, function () {
                            proceed = false;
                        });
                    }
                },
                flatten: {
                    writable: true,
                    value: function (depth) {
                        depth = numericArg(depth, 0);
                        var pump = this._pump;
                        var proceed = true;
                        return Emit.create(function (notify, rethrow) {
                            pump(function* () {
                                try {
                                    while (proceed) {
                                        var v = yield;
                                        if (isSequence(v)) {
                                            v.forEach(depth === 0 ?
                                                notify :
                                                function (x) {
                                                    (x.isEmitter ? x : Emit.value(x))
                                                        .flatten(depth - 1).forEach(notify);
                                                });
                                        } else {
                                            notify(v);
                                        }
                                    }
                                } catch (e) {
                                    rethrow(e)
                                }
                            });
                        }, function () {
                            proceed = false;
                        });
                    }
                },
                accumulate: {
                    writable: true,
                    value: function (accumulator, seed) {
                        var pump = this._pump;
                        var proceed = true;
                        return Emit.create(function (notify, rethrow) {
                            pump(function* () {
                                try {
                                    var result = seed;
                                    while (proceed) {
                                        result = accumulator(result, (yield), this);
                                        notify(result);
                                    }
                                } catch (e) {
                                    rethrow(e);
                                }
                            }.bind(this));
                        }, function () {
                            proceed = false;
                        });
                    }
                },
                buffer: {
                    writable: true,
                    value: function (until, overlap) {
                        var callback = typeof until === 'number' ?
                            function (v, storage) { return storage.length >= until; } :
                            until.isEmitter ? until.didEmit : toFilter(until);
                        overlap || (overlap = 0);
                        var pump = this._pump;
                        var proceed = true;
                        return Emit.create(function (notify, rethrow) {
                            pump(function* () {
                                try {
                                    var storage = [];
                                    while (proceed) {
                                        var v = yield;
                                        var length = storage.push(v);
                                        if (callback(v, storage, this)) {
                                            notify(storage);
                                            storage = storage.slice(overlap >= 0 ? length - overlap : -overlap);
                                        }
                                    }
                                } catch (e) {
                                    rethrow(e);
                                }
                            }.bind(this));
                        }, function () {
                            proceed = false;
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
        inject: {
            writable: true,
            value: function () {
                var done = false;
                var _notify, _rethrow;
                return Object.defineProperties(Emit.create(function (notify, rethrow) {
                    _notify = notify;
                    _rethrow = rethrow;
                }, function () {
                    done = true;
                    _notify = noop;
                    _rethrow = noop;
                }), {
                    next: {
                        value: function next(v) {
                            _notify.apply(this, arguments);
                            return {
                                value: v,
                                done: done
                            }
                        }
                    },
                    throw: {
                        value: function () {
                            _rethrow.apply(this, arguments);
                        }
                    }
                });
            }
        },
        value: {
            writable: true,
            value: function value(v) {
                var p = Promise.resolve(v);
                return Emit.create(p.then.bind(p));
            }
        },
        merge: {
            writable: true,
            value: function merge() {
                return Emit.value(multiArgs(arguments)).flatten(1);
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
                }, window.cancelAnimationFrame.bind(window, id));
            }
        },
        interval: {
            writable: true,
            value: function interval() {
                var args = slice.call(arguments, 0);
                var id;
                return Emit.create(function (notify) {
                    function callback() {
                        notify(arguments.length <= 1 ? arguments[0] : slice.call(arguments, 0));
                    }
                    id = window.setInterval.apply(window, [callback].concat(args));
                }, window.clearInterval.bind(window, id));
            }
        }
    });
}(Emit || (Emit = {})));
