# Delivery notice

This package is private and UNLICENSED. The tgz is an evaluation/delivery artifact, not an npm publication or an open-source license grant.

Runtime integrations use the public, published Cordis and DeepSeek Harness packages at the versions recorded in package.json and package-lock.json. HTTP uses undici 8.12.3 and SSE parsing uses eventsource-parser 3.0.6; validation uses zod 4.4.3 and @deepseek-ai/schemastery 3.18.5. Their respective licenses remain in their separately installed packages.

OpenAI 7.45.1 is a development-only comparison dependency. It is not the plugin's inference transport and is not copied into the tgz. No dependency implementation, SAP credential, service key, access token, or private business prompt is embedded in this package.
