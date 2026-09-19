const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { planWorkflowSteps, normalizeConcurrency, runPool } = require('../src/services/workflowRunPlanner');

describe('workflowRunPlanner', () => {
  it('skips existing image and runs video', () => {
    const plan = planWorkflowSteps(
      { id: 1, dialogue: 'hi' },
      ['image', 'video'],
      { skipExistingImage: true, skipExistingVideo: true },
      { hasImage: true, hasVideo: false },
    );
    assert.deepEqual(plan, [
      { step: 'image', action: 'skip', reason: 'has_image' },
      { step: 'video', action: 'run' },
    ]);
  });

  it('continue-on-error does not skip remaining items in the plan itself', () => {
    const plan = planWorkflowSteps({ dialogue: 'a' }, ['image', 'video'], {}, {});
    assert.equal(plan.filter((p) => p.action === 'run').length, 2);
  });

  it('forces concurrency 1 when linking tail frames', () => {
    assert.equal(normalizeConcurrency(4, true), 1);
    assert.equal(normalizeConcurrency(3, false), 3);
  });

  it('runPool respects concurrency cap', async () => {
    let current = 0;
    let max = 0;
    const items = [1, 2, 3, 4, 5, 6];
    const { maxActive } = await runPool(items, 2, async () => {
      current += 1;
      if (current > max) max = current;
      await new Promise((r) => setTimeout(r, 20));
      current -= 1;
    });
    assert.ok(maxActive <= 2);
    assert.equal(max, maxActive);
  });

  it('stopOnError can drain the queue via shouldStop', async () => {
    let ran = 0;
    let stop = false;
    await runPool([1, 2, 3, 4], 1, async () => {
      ran += 1;
      if (ran === 1) stop = true;
    }, { shouldStop: () => stop });
    assert.equal(ran, 1);
  });
});
