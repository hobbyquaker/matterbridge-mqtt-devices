/**
 * This file is the entry point for the matterbridge-mqtt-devices plugin.
 *
 * @file module.ts
 * @author hobbyquaker
 * @created 2026-05-26
 * @version 0.9.0
 * @license Apache-2.0
 *
 * Copyright 2026 hobbyquaker.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import type { PlatformConfig, PlatformMatterbridge } from 'matterbridge';
import { AnsiLogger } from 'matterbridge/logger';

import { MqttPlatform } from './platform.js';

export { MqttPlatform };

/**
 * Initializes the matterbridge-mqtt-devices plugin and returns the platform instance.
 *
 * @param {PlatformMatterbridge} matterbridge - The Matterbridge platform interface.
 * @param {AnsiLogger} log - The logger instance provided by Matterbridge.
 * @param {PlatformConfig} config - The plugin configuration.
 * @returns {MqttPlatform} The initialized MQTT platform instance.
 */
export default function initializePlugin(matterbridge: PlatformMatterbridge, log: AnsiLogger, config: PlatformConfig): MqttPlatform {
  return new MqttPlatform(matterbridge, log, config);
}
