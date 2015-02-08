var Emit;
(function (Emit) {
    'use strict';

    function noop() {};
    var noopIter = {
        next: function () {
            return {
                done: true
            };
        },
        'throw': noop
    };

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
        return Array.isArray(args[0]) ? args[0] : slice.call(args, 0);
    }

    var toFilter = typeof Sequences !== 'undefined' ?
        Sequences.toFilter :
        function (f) { 
            return f; 
        };

    function makeContainer() {
        var map = new Map();
        return {
            add: function (key, value) {
                return map.set(key, value).size === 1;
            },
            remove: function (key) {
                map.delete(key);
                return map.size === 0;
            },
            next: function () {
                var args = arguments;
                map.forEach(function (value, key) {
                    if (value.next.apply(value, args).done) {
                        map.delete(key);
                    }
                });
                return {
                    done: map.size === 0
                };
            },
            'throw': function () {
                var args = arguments;
                map.forEach(function (value) {
                    value.throw.apply(value, args);
                });
            }
        };
    }

    function join(args, isReady) {
        var emitters = multiArgs(args);
        var done = false;

        function isDone() {
            return done;
        }

        return Emit.reusable(function (iter) {
            var values = emitters.map(function () { 
                return undefined; 
            });
            var states = emitters.map(function () { 
                return false; 
            });
            function update(index, value) {
                values[index] = value;
                states[index] = true;
                if (isReady(states)) {
                    iter.next(values.slice(0));
                }
            }
            emitters.forEach(function (emitter, index) {
                emitter.until(isDone).forEach(update.bind(null, index), iter.throw);
            });
        }, function () {
            done = true;
        });
    }

    Object.defineProperties(Emit, {
        prototype: {
            value: Object.create(Object.getPrototypeOf({}), {
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
                match: {
                    writable: true,
                    value: function () {
                        var finished = Emit.iter();
                        var matchers = multiArgs(arguments);
                        this._pump(function* () {
                            try {
                                finished.next(false);
                                var done = new Set();
                                while (matchers.length > done.size) {
                                    var v = yield;
                                    matchers.some(function (matcher) {
                                        if (!done.has(matcher) && matcher.test(v, this)) {
                                            if (typeof matcher.next === 'function') {
                                                if (matcher.next(v, this).done) {
                                                    done.add(matcher);
                                                }
                                            }
                                            return true;
                                        }
                                    });
                                }
                                finished.next(true);
                            } catch (e) {
                                matchers.forEach(function (matcher) {
                                    if (typeof  matcher.throw === 'function') {
                                        matcher.throw(e, this);
                                    }
                                });
                            }
                        }.bind(this));
                        return finished;
                    }
                },
                filter: {
                    writable: true,
                    value: function (filter) {
                        var matcher = Emit.iter();
                        var finished = this.match(matcher);
                        matcher.test = Emit.isEmitter(filter) ?
                            filter.until(finished).latest :
                            toFilter(filter);
                        return matcher;
                    }
                },
                map: {
                    writable: true,
                    value: function (selector) {
                        var callback = typeof selector === 'function' ?
                            selector :
                            function () { return selector; };
                        var pump = this._pump;
                        var proceed;
                        return Emit.reusable(function (iter) {
                            proceed = true;
                            pump(function* () {
                                try {
                                    var prev = Promise.resolve();
                                    while (proceed) {
                                        var v = yield;
                                        v = callback(v, this);
                                        if (isThenable(v)) {
                                            prev = Promise.all([prev, v]);
                                            prev.then(function (vs) {
                                                iter.next(vs[1]);
                                            }, function (e) {
                                                rethrow(e);
                                            });
                                        } else {
                                            iter.next(v);
                                        }
                                    }
                                } catch (e) {
                                    iter.throw(e);
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
                        var pump = this._pump;
                        return Emit.reusable(function (iter) {
                            pump(function* () {
                                try {
                                    var done = false;
                                    var callback = Emit.isEmitter(filter) ? 
                                        filter.until(function () { return done; }).didEmit : 
                                        toFilter(filter);
                                    var v;
                                    do {
                                        v = yield;
                                    } while (!callback(v, this) && !iter.next(v).done);
                                    done = true;
                                } catch (e) {
                                    iter.throw(e);
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
                        return Emit.reusable(function (iter) {
                            pump(function* () {
                                try {
                                    var proceed = true;
                                    while (proceed) {
                                        setTimeout(function () {
                                            proceed = !iter.next(this).done;
                                        }.bind(yield), duration);
                                    }
                                } catch (e) {
                                    iter.throw(e);
                                }
                            });
                        });
                    }
                },
                distinct: {
                    writable: true,
                    value: function () {
                        var pump = this._pump;
                        return Emit.reusable(function (iter) {
                            pump(function* () {
                                var v, prev;
                                try {
                                    do {
                                        v = yield;
                                    } while (v === prev || !iter.next(prev = v).done);
                                } catch (e) {
                                    iter.throw(e);
                                }
                            });
                        });
                    }
                },
                flatten: {
                    writable: true,
                    value: function (depth) {
                        depth = numericArg(depth, 0);
                        var pump = this._pump;
                        var proceed;
                        return Emit.reusable(function (iter) {
                            proceed = true;
                            pump(function* () {
                                try {
                                    while (proceed) {
                                        var v = yield;
                                        if (!isSequence(v)) {
                                            iter.next(v);
                                        } else {
                                            v.forEach(depth === 0 ?
                                                iter.next :
                                                function (a) {
                                                    var emitter = Emit.isEmitter(a) ? a : Emit.value(a);
                                                    emitter
                                                        .flatten(depth - 1)
                                                        .until(function (b) {
                                                            return iter.next(b).done;
                                                        }).forEach(noop);
                                                });
                                        }
                                    }
                                } catch (e) {
                                    iter.throw(e);
                                }
                            });
                        }, function () {
                            proceed = false;
                        });
                    }
                },
                accumulate: {
                    writable: true,
                    value: function (accumulator, value) {
                        var pump = this._pump;
                        return Emit.reusable(function (iter) {
                            pump(function* () {
                                try {
                                    do {
                                        value = accumulator(value, (yield), this);
                                    } while (!iter.next(value).done);
                                } catch (e) {
                                    iter.throw(e);
                                }
                            }.bind(this));
                        });
                    }
                },
                buffer: {
                    writable: true,
                    value: function (until, overlap) {
                        overlap || (overlap = 0);
                        var pump = this._pump;
                        return Emit.reusable(function (iter) {
                            pump(function* () {
                                try {
                                    var done = false;
                                    var callback = typeof until === 'number' ?
                                        function (v, storage) { return storage.length >= until; } :
                                        Emit.isEmitter(until) ? 
                                            until.until(function () { return done; }).didEmit :
                                            toFilter(until);
                                    var storage = [];
                                    while (true) {
                                        var v = yield;
                                        var length = storage.push(v);
                                        if (callback(v, storage, this)) {
                                            if (iter.next(storage).done) {
                                                break;
                                            }
                                            storage = storage.slice(overlap >= 0 ? length - overlap : -overlap);
                                        }
                                    }
                                    done = true;
                                } catch (e) {
                                    iter.throw(e);
                                }
                            }.bind(this));
                        });
                    }
                },
                listen: {
                    writable: true,
                    value: function (listener) {
                        var pump = this._pump;
                        var done = false;
                        return Emit.reusable(function (iter) {
                            pump(function* () {
                                try {
                                    do {
                                        done = done || listener.next(v).done;
                                    } while (!iter.next(v).done);
                                } catch (e) {
                                    if (!done) {
                                        listener.throw(e);
                                    }
                                    iter.throw(e);
                                }
                            });
                        });
                    }
                },
                didEmit: {
                    get: function () {
                        var result = false;
                        this.forEach(function () { 
                            result = true;
                        });
                        return function () {
                            var r = result;
                            result = false;
                            return r;
                        };
                    }
                },
                latest: {
                    get: function (result) {
                        this.forEach(function (v) { 
                            result = v; 
                        });
                        return function () {
                            return result;
                        };
                    }
                },
                throttle: {
                    writable: true,
                    value: function (duration) {
                        return Emit.sync(this, Emit.interval(duration)).map(function (vs) { 
                            return vs[0]; 
                        });
                    }
                }
            })
        },
        isEmitter: {
            writable: true,
            value: function (x) {
                return !!x && typeof x === 'object' && Object.getPrototypeOf(x) === Emit.prototype;
            }
        },
        create: {
            writable: true,
            value: function (source, done) {
                done || (done = noop);
                return Object.create(Emit.prototype, {
                    _pump: {
                        value: function pump(generator) {
                            var context = {};
                            var target = generator();
                            target.next();
                            var iter = {
                                next: function () {
                                    var r = target.next.apply(target, arguments);
                                    if (r.done) {
                                        done.call(context, iter);
                                    }
                                    return r;
                                },
                                throw: target.throw.bind(target)
                            };
                            source.call(context, iter);
                        }
                    }
                });
            }
        },
        reusable: {
            writable: true,
            value: function (source, done) {
                done || (done = noop);
                var container = makeContainer();
                return Emit.create(function (iter) {
                        if (container.add(this, iter)) {
                            source.call(this, container);
                        }
                    }, function () {
                        if (container.remove(this)) {
                            done.call(this, container);
                        }
                    });
            }
        },
        iter: {
            writable: true,
            value: function () {
                var _iter = noopIter;
                return Object.defineProperties(Emit.reusable(function (iter) {
                        _iter = iter;
                    }, function () {
                        _iter = noopIter;
                    }), {
                        next: {
                            writable: true,
                            value: function () {
                                return _iter.next.apply(_iter, arguments);
                            }
                        },
                        'throw': {
                            writable: true,
                            value: function () {
                                return _iter.throw.apply(_iter, arguments);
                            }
                        }
                    });
            }
        },
        value: {
            writable: true,
            value: function value(v) {
                return Emit.create(function (iter) {
                    if (v.jquery) {
                        v = jQuery.makeArray(v);
                    }
                    Promise.resolve(v).then(iter.next, iter.throw);
                });
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
                return join(arguments, function isReady(states) {
                    if (states.every(function (state) { return state; })) {
                        states.forEach(function (state, index, array) { array[index] = false; });
                        return true;
                    }
                    return false;
                });
            }
        },
        combine: {
            writable: true,
            value: function combine() {
                var ready = false;
                return join(arguments, function isReady(states) {
                    if (ready || states.every(function (state) { return state; })) {
                        ready = true;
                        return true;
                    }
                    return false;
                });
            }
        },
        events: {
            writable: true,
            value: function events(type, element) {
                return Emit.reusable(function (iter) {
                        if (typeof element.on === 'function') {
                            element.on(type, iter.next);
                        } else {
                            element.addEventListener(type, iter.next, false);
                        }
                    }, function (iter) {
                        if (typeof element.off === 'function') {
                            element.off(type, iter.next);
                        } else {
                            element.removeEventListener(type, iter.next, false);
                        }
                    });
            }
        },
        input: {
            writable: true,
            value: function events(element) {
                return Emit.merge(
                    Emit.value(element.value), 
                    Emit.events('input', element)
                        .map(function (ev) {
                            return ev.target.value;
                        }));
            }
        },
        animationFrames: {
            writable: true,
            value: function animationFrames() {
                var id;
                return Emit.reusable(function (iter) {
                        id = window.requestAnimationFrame(function raf(timestamp) {
                            iter.next(timestamp);
                            id = window.requestAnimationFrame(raf);
                        });
                    }, function () {
                        window.cancelAnimationFrame(id);
                    });
            }
        },
        interval: {
            writable: true,
            value: function interval(duration) {
                var id;
                return Emit.reusable(function (iter) {
                        id = window.setInterval(iter.next, duration);
                    }, function () {
                        window.clearInterval(id);
                    });
            }
        }
    });
}(Emit || (Emit = {})));
