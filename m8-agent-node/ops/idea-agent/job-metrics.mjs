export function summarizeJob({ tests, pass, fail } = {}) {
  if (![tests, pass, fail].every(count => Number.isInteger(count) && count >= 0)) {
    throw new TypeError('Job counts must be non-negative integers');
  }

  if (tests !== pass + fail) {
    throw new TypeError('tests must equal pass + fail');
  }

  return { status: fail === 0 ? 'passed' : 'failed', tests, pass, fail };
}
