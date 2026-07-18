import net from 'node:net';

import { jest } from '@jest/globals';
import { log, setupTest } from '@matterbridge/jest-utils';
import {
  addMatterbridge,
  createServerNode,
  createTestEnvironment,
  destroyTestEnvironment,
  getMatterbridge,
  startServerNode,
  stopServerNode,
} from '@matterbridge/jest-utils/matter';
import { Aedes } from 'aedes';
import type { MatterbridgeEndpoint, PlatformConfig } from 'matterbridge';

import initializePlugin, { MqttPlatform } from '../src/module.js';

jest.setTimeout(120_000);

// ── Helpers ───────────────────────────────────────────────────────────────────

async function waitFor(predicate: () => boolean, timeout = 10_000, interval = 20): Promise<void> {
  const start = Date.now();
  while (!predicate()) {
    if (Date.now() - start > timeout) throw new Error('Timeout waiting for condition');
    await new Promise((resolve) => setTimeout(resolve, interval));
  }
}

// ── E2E: aedes broker ⇄ real mqtt client ⇄ platform ⇄ Matter server node ──────

describe('End to end with aedes broker and Matter server node', () => {
  let broker: Aedes;
  let brokerServer: net.Server;
  let brokerPort: number;
  let platform: MqttPlatform;
  // Messages published by the plugin's mqtt client, keyed by topic (latest wins)
  const clientMessages = new Map<string, string>();

  function endpoint(id: string): MatterbridgeEndpoint {
    const ep = (platform as unknown as { endpointMap: Map<string, MatterbridgeEndpoint> }).endpointMap.get(id);
    if (!ep) throw new Error(`Endpoint not found: ${id}`);
    return ep;
  }

  // executeCommandHandler declares five required parameters; only command and request matter here
  function invokeCommand(ep: MatterbridgeEndpoint, command: string, request?: Record<string, unknown>): Promise<unknown> {
    return (ep as any).executeCommandHandler(command, request);
  }

  function brokerPublish(topic: string, payload: string): Promise<void> {
    return new Promise((resolve, reject) => {
      broker.publish({ cmd: 'publish', topic, payload: Buffer.from(payload), qos: 0, retain: false, dup: false }, (err) => (err ? reject(err) : resolve()));
    });
  }

  beforeAll(async () => {
    await setupTest('MqttDevicesE2E', false);
    await createTestEnvironment();
    await createServerNode(5590);
    await startServerNode();

    broker = await Aedes.createBroker();
    broker.on('publish', (packet, client) => {
      if (client) clientMessages.set(packet.topic, packet.payload.toString());
    });
    const subscribedTopics = new Set<string>();
    broker.on('subscribe', (subscriptions) => {
      for (const subscription of subscriptions) subscribedTopics.add(subscription.topic);
    });
    brokerServer = net.createServer(broker.handle);
    await new Promise<void>((resolve) => brokerServer.listen(0, '127.0.0.1', resolve));
    brokerPort = (brokerServer.address() as net.AddressInfo).port;

    const matterbridge = getMatterbridge();
    (matterbridge as unknown as { bridgeMode: string }).bridgeMode = 'bridge';
    const config = {
      name: 'matterbridge-mqtt-devices',
      type: 'DynamicPlatform',
      version: '0.11.0',
      broker: `mqtt://127.0.0.1:${brokerPort}`,
      devices: [
        { name: 'E2E Light', id: 'light1', type: 'on-off-light', topicSetOnOff: 'e2e/light/set', topicOnOff: 'e2e/light/state' },
        {
          name: 'E2E Dimmer',
          id: 'dim1',
          type: 'dimmable-light',
          topicSetOnOff: 'e2e/dim/set',
          topicOnOff: 'e2e/dim/state',
          topicMoveToLevel: 'e2e/dim/bri/set',
          topicCurrentLevel: 'e2e/dim/bri',
          brightnessMin: 0,
          brightnessMax: 254,
        },
        { name: 'E2E Temp', id: 'temp1', type: 'temperature-sensor', topicTemperature: 'e2e/temp' },
      ],
      debug: false,
      unregisterOnShutdown: false,
    } as unknown as PlatformConfig;

    platform = initializePlugin(matterbridge, log, config);
    addMatterbridge(platform);
    await platform.onStart('e2e test');
    // The publishes in the tests race the SUBACKs otherwise
    await waitFor(() => ['e2e/light/state', 'e2e/dim/bri', 'e2e/temp'].every((topic) => subscribedTopics.has(topic)));
  }, 120_000);

  afterAll(async () => {
    await platform.onShutdown('e2e test');
    await stopServerNode();
    await new Promise<void>((resolve) => broker.close(() => resolve()));
    await new Promise<void>((resolve) => brokerServer.close(() => resolve()));
    await destroyTestEnvironment();
  }, 120_000);

  it('should register all configured devices on the aggregator', () => {
    expect(endpoint('light1').lifecycle.isReady).toBe(true);
    expect(endpoint('dim1').lifecycle.isReady).toBe(true);
    expect(endpoint('temp1').lifecycle.isReady).toBe(true);
  });

  it('should turn the light on via an mqtt state message', async () => {
    const ep = endpoint('light1');
    await brokerPublish('e2e/light/state', 'ON');
    await waitFor(() => ep.getAttribute('OnOff', 'onOff') === true);
    expect(ep.getAttribute('OnOff', 'onOff')).toBe(true);
    await brokerPublish('e2e/light/state', 'OFF');
    await waitFor(() => ep.getAttribute('OnOff', 'onOff') === false);
    expect(ep.getAttribute('OnOff', 'onOff')).toBe(false);
  });

  it('should publish an mqtt command when the light receives an on command', async () => {
    clientMessages.clear();
    await invokeCommand(endpoint('light1'), 'on');
    await waitFor(() => clientMessages.get('e2e/light/set') === 'ON');
    expect(clientMessages.get('e2e/light/set')).toBe('ON');
    await invokeCommand(endpoint('light1'), 'off');
    await waitFor(() => clientMessages.get('e2e/light/set') === 'OFF');
    expect(clientMessages.get('e2e/light/set')).toBe('OFF');
  });

  it('should update currentLevel from an mqtt brightness message', async () => {
    const ep = endpoint('dim1');
    await brokerPublish('e2e/dim/bri', '127');
    await waitFor(() => ep.getAttribute('LevelControl', 'currentLevel') === 127);
    expect(ep.getAttribute('LevelControl', 'currentLevel')).toBe(127);
  });

  it('should publish the brightness when the dimmer receives moveToLevel', async () => {
    clientMessages.clear();
    await invokeCommand(endpoint('dim1'), 'moveToLevel', { level: 200 });
    await waitFor(() => clientMessages.get('e2e/dim/bri/set') === '200');
    expect(clientMessages.get('e2e/dim/bri/set')).toBe('200');
  });

  it('should update measuredValue from an mqtt temperature message', async () => {
    const ep = endpoint('temp1');
    await brokerPublish('e2e/temp', '21.57');
    await waitFor(() => ep.getAttribute('TemperatureMeasurement', 'measuredValue') === 2157);
    expect(ep.getAttribute('TemperatureMeasurement', 'measuredValue')).toBe(2157);
    await brokerPublish('e2e/temp', '{"temperature":22}');
    await waitFor(() => ep.getAttribute('TemperatureMeasurement', 'measuredValue') === 2200);
    expect(ep.getAttribute('TemperatureMeasurement', 'measuredValue')).toBe(2200);
  });
});
