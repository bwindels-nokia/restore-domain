/*jshint evil: false, bitwise:false, strict: false, undef: true, white: false, plusplus:false, node:true */
/*global */

var testCase = require('nodeunit').testCase;
var domain = require('domain');
var wrap = require('restore-domain').wrap;
var EventEmitter = require('events').EventEmitter;
var _ = require('underscore');

var callbacks = {};

function createCollection(connectionPool) {
    var parent = {
        find: function(query) {
            return {
                count: function(callback) {
                    callbacks[query.callbackId] = callback;
                    connectionPool.emit('response', query.callbackId, [5]);
                }
            };
        }
    };
    var child = _.extend(Object.create(parent), {
        insert: function(doc, callback) {
            callbacks[doc.callbackId] = callback;
            connectionPool.emit('response', doc.callbackId, [true]);
        },
        collectionName: 'foo'
    });
    return child;
}

module.exports = testCase({
    "test connectionPool": function(test) {
        var wrappedMO;
        var connectionPool;
        var d1 = domain.create();
        
        d1.run(function() {
            connectionPool = new EventEmitter();
            connectionPool.on('response', function() {
                test.strictEqual(process.domain, d1);
                test.done();
            });
        });

        
        var d2 = domain.create();
        
        d2.run(function() {
            test.strictEqual(process.domain, d2);

            connectionPool.emit('response');
        });

    },
    "test wrapMongoObject does not modify the original object": function(test) {
        var mo = createCollection(new EventEmitter());
        var wrappedMO = wrap(mo);

        test.notStrictEqual(mo.insert, wrappedMO.insert);
        test.notStrictEqual(mo.find, wrappedMO.find);
        test.strictEqual(mo.collectionName, wrappedMO.collectionName);
        test.done();
    },
    "test wrapMongoObject with domain": function(test) {
        var connectionPool;
        var poolDomain = domain.create();

        //emulate connectionPool
        poolDomain.run(function() {
            connectionPool = new EventEmitter();
            connectionPool.on('response', function(callbackId, args) {
                test.strictEqual(process.domain, poolDomain);
                var callback = callbacks[callbackId];
                callback.apply(null, args);
            });
        });

        test.strictEqual(typeof connectionPool, 'object', 'make sure poolDomain.run is not asynchronous');
        var mo = createCollection(connectionPool);
        var wrappedMO = wrap(mo);

        var queryDomain = domain.create();

        queryDomain.run(function() {
            mo.insert({callbackId: 65}, function() {
                test.strictEqual(process.domain, poolDomain, 'test that without wrapping, we end up in the pool domain');
            });

            test.strictEqual(process.domain, queryDomain, 'should be in the queryDomain');

            wrappedMO.insert({callbackId: 9}, function() {
                test.strictEqual(process.domain, queryDomain, 'test that using wrapping, we end up in the query domain');
            });

            var cursor = wrappedMO.find({callbackId:2});
            cursor.count(function(amount) {
                test.strictEqual(amount, 5);
                test.strictEqual(process.domain, queryDomain, 'test using a cursor and using wrapping, we end up in the query domain');
            });

            test.done();
        });

        
    }
});
