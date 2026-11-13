import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { SentinelRingBuffer } from '../src-core/sentinel/ringBuffer.ts';
import { AnomalyDetector } from '../src-core/sentinel/anomalyDetector.ts';
import type { SentinelSample } from '../src/types/sentinel.ts';

describe('Sentinel Ring Buffer & Anomaly Detector Tests', () => {
  test('Ring Buffer enforces strict 150-sample FIFO capacity limit', () => {
    const ringBuffer = new SentinelRingBuffer(150);

    // Push 160 samples
    for (let i = 0; i < 160; i++) {
      const sample: SentinelSample = {
        timestamp: 1000 + i * 2000,
        gateway_rtt: 10 + (i % 5),
        anycast_rtt: 25.0,
        bssid: 'aa:bb:cc:dd:ee:01',
        ssid: 'Corp-5G',
        rssi: -50,
        noise: -90,
        is_gateway_loss: false,
        is_anycast_loss: false,
      };
      ringBuffer.push(sample);
    }

    assert.equal(ringBuffer.length, 150, 'Buffer length must strictly not exceed 150');
    // First sample should have been evicted (sample 0..9 popped, sample 10 is first)
    const all = ringBuffer.getAll();
    assert.equal(all[0].timestamp, 1000 + 10 * 2000);
    assert.equal(all[149].timestamp, 1000 + 159 * 2000);
  });

  test('Computes accurate rolling median and jitter over 1-minute window', () => {
    const ringBuffer = new SentinelRingBuffer(150);
    const latencies = [10, 12, 11, 10, 14, 13, 11, 10, 12, 11];

    latencies.forEach((rtt, idx) => {
      ringBuffer.push({
        timestamp: 1000 + idx * 2000,
        gateway_rtt: rtt,
        anycast_rtt: 25.0,
        bssid: 'aa:bb:cc:dd:ee:01',
        ssid: 'Corp-5G',
        rssi: -50,
        noise: -90,
        is_gateway_loss: false,
        is_anycast_loss: false,
      });
    });

    const median = ringBuffer.rollingMedianGatewayRtt(10);
    assert.ok(median !== null);
    assert.equal(median, 11, 'Median of latencies should be 11');

    const jitter = ringBuffer.rollingJitterGatewayRtt(10);
    assert.ok(jitter !== null);
    assert.ok(jitter > 0 && jitter < 2.0, `Jitter should be ~1.2ms, got ${jitter}`);
  });

  test('Detects Latency Spike anomaly when RTT jumps > 150ms over rolling median', () => {
    const ringBuffer = new SentinelRingBuffer(150);
    const detector = new AnomalyDetector(180_000);

    // Feed 15 baseline samples around 12ms
    for (let i = 0; i < 15; i++) {
      ringBuffer.push({
        timestamp: 1000 + i * 2000,
        gateway_rtt: 12.0,
        anycast_rtt: 25.0,
        bssid: 'aa:bb:cc:dd:ee:01',
        ssid: 'Corp-5G',
        rssi: -50,
        noise: -90,
        is_gateway_loss: false,
        is_anycast_loss: false,
      });
    }

    // Baseline should not trigger anomaly
    let incident = detector.evaluate(ringBuffer, 1000 + 14 * 2000);
    assert.equal(incident, null, 'Normal baseline must not trigger anomaly');

    // Add a latency spike of 175ms (175 - 12 = 163ms > 150ms threshold)
    ringBuffer.push({
      timestamp: 1000 + 15 * 2000,
      gateway_rtt: 175.0,
      anycast_rtt: 25.0,
      bssid: 'aa:bb:cc:dd:ee:01',
      ssid: 'Corp-5G',
      rssi: -50,
      noise: -90,
      is_gateway_loss: false,
      is_anycast_loss: false,
    });

    incident = detector.evaluate(ringBuffer, 1000 + 15 * 2000);
    assert.ok(incident !== null, 'Latency spike > 150ms must trigger incident');
    assert.equal(incident?.trigger_reason, 'LATENCY_SPIKE');
    assert.ok(incident?.trigger_description.includes('网关延迟突增尖刺'));
  });

  test('Detects Burst Packet Loss anomaly on >= 2 consecutive timeouts', () => {
    const ringBuffer = new SentinelRingBuffer(150);
    const detector = new AnomalyDetector(180_000);

    // Sample 1: Healthy
    ringBuffer.push({
      timestamp: 1000,
      gateway_rtt: 12.0,
      anycast_rtt: 25.0,
      bssid: 'aa:bb:cc:dd:ee:01',
      ssid: 'Corp-5G',
      rssi: -50,
      noise: -90,
      is_gateway_loss: false,
      is_anycast_loss: false,
    });

    // Sample 2: 1 single loss (transient drop - should not trigger burst yet)
    ringBuffer.push({
      timestamp: 3000,
      gateway_rtt: null,
      anycast_rtt: 25.0,
      bssid: 'aa:bb:cc:dd:ee:01',
      ssid: 'Corp-5G',
      rssi: -50,
      noise: -90,
      is_gateway_loss: true,
      is_anycast_loss: false,
    });

    let incident = detector.evaluate(ringBuffer, 3000);
    assert.equal(incident, null, 'Single drop should not trigger burst loss');

    // Sample 3: 2nd consecutive loss (burst packet loss!)
    ringBuffer.push({
      timestamp: 5000,
      gateway_rtt: null,
      anycast_rtt: 25.0,
      bssid: 'aa:bb:cc:dd:ee:01',
      ssid: 'Corp-5G',
      rssi: -50,
      noise: -90,
      is_gateway_loss: true,
      is_anycast_loss: false,
    });

    incident = detector.evaluate(ringBuffer, 5000);
    assert.ok(incident !== null, '2 consecutive timeouts must trigger BURST_LOSS');
    assert.equal(incident?.trigger_reason, 'BURST_LOSS');
    assert.ok(incident?.trigger_description.includes('连续2次探测丢包超时'));
  });

  test('Detects AP Roaming Flap anomaly on >= 2 distinct BSSIDs in 60s window', () => {
    const ringBuffer = new SentinelRingBuffer(150);
    const detector = new AnomalyDetector(180_000);

    // Initial AP BSSID: aa:bb:cc:dd:ee:01
    for (let i = 0; i < 5; i++) {
      ringBuffer.push({
        timestamp: 1000 + i * 2000,
        gateway_rtt: 12.0,
        anycast_rtt: 25.0,
        bssid: 'aa:bb:cc:dd:ee:01',
        ssid: 'Corp-5G',
        rssi: -50,
        noise: -90,
        is_gateway_loss: false,
        is_anycast_loss: false,
      });
    }

    let incident = detector.evaluate(ringBuffer, 9000);
    assert.equal(incident, null, 'Same BSSID should not trigger flap');

    // Roamed to AP 2: aa:bb:cc:dd:ee:02 within 60s
    ringBuffer.push({
      timestamp: 11000,
      gateway_rtt: 12.0,
      anycast_rtt: 25.0,
      bssid: 'aa:bb:cc:dd:ee:02',
      ssid: 'Corp-5G',
      rssi: -65,
      noise: -90,
      is_gateway_loss: false,
      is_anycast_loss: false,
    });

    incident = detector.evaluate(ringBuffer, 11000);
    assert.ok(incident !== null, 'Roaming between APs within 60s must trigger AP_ROAMING_FLAP');
    assert.equal(incident?.trigger_reason, 'AP_ROAMING_FLAP');
    assert.equal(incident?.metrics_at_trigger.distinct_bssids_last_60s.length, 2);
  });

  test('Enforces strict 3-minute cooldown to prevent notification storms', () => {
    const ringBuffer = new SentinelRingBuffer(150);
    const detector = new AnomalyDetector(180_000); // 180s cooldown

    // Trigger first burst loss at t = 10,000ms
    ringBuffer.push({
      timestamp: 8000,
      gateway_rtt: null,
      anycast_rtt: null,
      bssid: 'aa:bb:cc:dd:ee:01',
      ssid: 'Corp-5G',
      rssi: -50,
      noise: -90,
      is_gateway_loss: true,
      is_anycast_loss: true,
    });
    ringBuffer.push({
      timestamp: 10000,
      gateway_rtt: null,
      anycast_rtt: null,
      bssid: 'aa:bb:cc:dd:ee:01',
      ssid: 'Corp-5G',
      rssi: -50,
      noise: -90,
      is_gateway_loss: true,
      is_anycast_loss: true,
    });

    const firstIncident = detector.evaluate(ringBuffer, 10000);
    assert.ok(firstIncident !== null, 'First anomaly must trigger');
    assert.equal(detector.isInCooldown(10000), true, 'Cooldown starts immediately after trigger');
    assert.equal(detector.remainingCooldownMs(10000), 180000);

    // 10 seconds later (t = 20,000ms), loss continues
    assert.equal(detector.isInCooldown(20000), true);
    assert.equal(detector.remainingCooldownMs(20000), 170000);

    const suppressedIncident = detector.evaluate(ringBuffer, 20000);
    assert.equal(suppressedIncident, null, 'Must suppress subsequent anomalies during 3m cooldown');

    // After 181 seconds (t = 191,000ms), cooldown expires
    assert.equal(detector.isInCooldown(191000), false);
    assert.equal(detector.remainingCooldownMs(191000), 0);

    const postCooldownIncident = detector.evaluate(ringBuffer, 191000);
    assert.ok(postCooldownIncident !== null, 'Anomaly can trigger after cooldown expires');
  });
});
