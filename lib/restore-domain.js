/*jshint evil: false, bitwise:false, strict: false, undef: true, white: false, plusplus:false, node:true */

var upp = require('upperscore');

function wrapFunction(fn, thisArg) {
    return function() {
        var priorDomain = process.domain;
        var args = Array.prototype.slice.call(arguments);
        args = args.map(function(arg) {
            if(priorDomain && typeof arg === 'function') {
                return priorDomain.bind(arg);
            } else {
                return arg;
            }
        });
        var retVal = fn.apply(thisArg, args);
        if(typeof retVal === 'object') {
            return wrap(retVal);
        } else {
            return retVal;
        }
    };
}

/** this fixes the issue with the mongodb driver that
    using a connection pool make the callback being 
    called with the wrong domain, originalObjectre precisely the
    domain the connectionPool was created in, and not
    the domain of the operation (the request domain). */
function wrap(originalObject) {
    var functionNames = upp.functions(originalObject);
    var wrappedFunctions = functionNames.map(function(fName) {
        var originalFunction = originalObject[fName];
        return wrapFunction(originalFunction, originalObject);
    });

    var childWrappedFunctions = upp.dict(functionNames, wrappedFunctions);
    //create an object that has originalObject as it's prototype
    var child = Object.create(originalObject);
    //copy wrapped functions over
    upp.extend(child, childWrappedFunctions);

    return child;
}

module.exports = {
    wrap: wrap,
    wrapFunction: wrapFunction
};