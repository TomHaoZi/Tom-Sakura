const { test } = require('node:test');
const assert = require('node:assert/strict');
const { normalizeWindowState } = require('../electron/window-state.cjs');
const screen = {x:0,y:0,width:1920,height:1040};
test('default window is centered and fits the work area', () => {
  const result = normalizeWindowState({}, [screen]);
  assert.equal(result.width, 1440); assert.equal(result.x, 240); assert.equal(result.height, 940);
});
test('a removed monitor does not leave the app off screen', () => {
  const result = normalizeWindowState({x:-3000,y:5000,width:5000,height:3000,maximized:true}, [screen]);
  assert.equal(result.x, 0); assert.equal(result.y, 0); assert.equal(result.width,1920); assert.equal(result.height,1040); assert.equal(result.maximized,true);
});
test('corrupt values and small displays are handled safely', () => {
  const result = normalizeWindowState({width:NaN,height:-10}, [{x:0,y:0,width:800,height:600}]);
  assert.equal(result.width,800); assert.equal(result.height,600); assert.equal(result.minWidth,800);
});
