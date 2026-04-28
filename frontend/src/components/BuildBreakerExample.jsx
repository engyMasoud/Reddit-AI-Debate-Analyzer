import React from 'react';
import { ghostValue } from '../utils/notARealFile.js';

/**
 * Intentional canary module:
 * - Looks like a normal component in review.
 * - Will fail `vite build` due to unresolved import.
 * - Can slip through a test-only pipeline when this file/path is not covered by tests.
 */
export default function BuildBreakerExample() {
  return (
    <section>
      <h2>Build Breaker Canary</h2>
      <p>Value: {ghostValue}</p>
    </section>
  );
}
