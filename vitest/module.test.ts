import path from 'node:path';
import { describe, it, expect, vi, beforeEach, afterAll, type MockInstance } from 'vitest';
import type { PlatformConfig, PlatformMatterbridge } from 'matterbridge';
import { AnsiLogger } from 'matterbridge/logger';
import { VendorId } from 'matterbridge/matter';

// vi.mock is hoisted — declare mock client via vi.hoisted so it is available in the factory
const mockMqttClient = vi.hoisted(() => ({
  connected: false,
  once: vi.fn((event: string, cb: (...args: any[]) => void) => { if (event === 'connect') cb(); }),
  on: vi.fn(),
  subscribe: vi.fn(),
  publish: vi.fn(),
  endAsync: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('mqtt', () => ({
  default: { connect: vi.fn(() => mockMqttClient) },
}));

import initializePlugin, { MqttPlatform } from '../src/module.js';

// ── Fixtures ──────────────────────────────────────────────────────────────────

const mockLog = {
  fatal: vi.fn(), error: vi.fn(), warn: vi.fn(),
  notice: vi.fn(), info: vi.fn(), debug: vi.fn(),
} as unknown as AnsiLogger;

const mockMatterbridge: PlatformMatterbridge = {
  systemInformation: { ipv4Address: '127.0.0.1', ipv6Address: '::1', osRelease: 'x', nodeVersion: '22.0.0' },
  rootDirectory:               path.join('.cache', 'vitest', 'MqttPlugin'),
  homeDirectory:               path.join('.cache', 'vitest', 'MqttPlugin'),
  matterbridgeDirectory:       path.join('.cache', 'vitest', 'MqttPlugin', '.matterbridge'),
  matterbridgePluginDirectory: path.join('.cache', 'vitest', 'MqttPlugin', 'Matterbridge'),
  matterbridgeCertDirectory:   path.join('.cache', 'vitest', 'MqttPlugin', '.mattercert'),
  globalModulesDirectory:      path.join('.cache', 'vitest', 'MqttPlugin', 'node_modules'),
  matterbridgeVersion: '3.5.0',
  matterbridgeLatestVersion: '3.5.0',
  matterbridgeDevVersion: '3.5.0',
  bridgeMode: 'bridge',
  restartMode: '',
  aggregatorVendorId: VendorId(0xfff1),
  aggregatorVendorName: 'Matterbridge',
  aggregatorProductId: 0x8000,
  aggregatorProductName: 'Matterbridge aggregator',
  registerVirtualDevice: vi.fn(async () => {}),
  addBridgedEndpoint: vi.fn(async () => {}),
  removeBridgedEndpoint: vi.fn(async () => {}),
  removeAllBridgedEndpoints: vi.fn(async () => {}),
} as unknown as PlatformMatterbridge;

const mockConfig: PlatformConfig = {
  name: 'matterbridge-mqtt-devices',
  type: 'DynamicPlatform',
  broker: 'mqtt://localhost:1883',
  devices: [],
  debug: false,
  unregisterOnShutdown: false,
};

let loggerLogSpy: MockInstance;

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('MqttPlatform', () => {
  let instance: MqttPlatform;

  beforeEach(() => {
    vi.clearAllMocks();
    mockMqttClient.connected = false;
    loggerLogSpy = vi.spyOn(AnsiLogger.prototype, 'log').mockImplementation((_level: string, _message: string, ..._parameters: any[]) => {});
  });

  afterAll(() => {
    vi.restoreAllMocks();
  });

  it('should create an instance via initializePlugin', () => {
    instance = initializePlugin(mockMatterbridge, mockLog, mockConfig);
    expect(instance).toBeInstanceOf(MqttPlatform);
    expect(instance.matterbridge).toBe(mockMatterbridge);
    expect(instance.config).toBe(mockConfig);
  });

  it('should start and warn when no devices are configured', async () => {
    await instance.onStart('test');
    expect(mockLog.warn).toHaveBeenCalledWith('No devices configured.');
  });

  it('should shut down cleanly when mqtt is not connected', async () => {
    mockMqttClient.connected = false;
    await instance.onShutdown('test');
    expect(mockMqttClient.endAsync).not.toHaveBeenCalled();
  });
});