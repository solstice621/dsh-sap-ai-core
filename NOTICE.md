# Delivery notice

This plugin is distributed under the MIT License; see LICENSE. It is an independent community plugin and is not an official SAP or DeepSeek product. SAP, Qwen, DeepSeek, and their product names belong to their respective owners.

Runtime integrations use the public, published Cordis and DeepSeek Harness peer packages at the versions recorded in package.json and package-lock.json. HTTP uses undici 8.12.3 and SSE parsing uses eventsource-parser 3.0.6; validation uses zod 4.4.3 and @deepseek-ai/schemastery 3.18.5. Their respective licenses remain in their separately installed packages. The repository includes compiled plugin code so installation does not require build scripts.

OpenAI 7.45.1 is a development-only comparison dependency. It is not the plugin's inference transport and is not copied into the tgz. No dependency implementation, SAP credential, service key, access token, or private business prompt is embedded in this package.
