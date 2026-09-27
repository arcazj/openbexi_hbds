# Server and AI setup

[Back to the README](../README.md)

## Server modes and saving

Run `python3 server.py --port 8010` from the project root, then open
`http://127.0.0.1:8010/`. On Windows, use `py` instead of `python3`.

Connected mode serves the app and enables model saves, AI requests, and live
collaboration. Edit saves to `models/`; Tests saves to `test_models/`. The server
regenerates both model manifests at startup. Their labels come from filenames,
with underscores and hyphens replaced by spaces.

Overwriting or deleting a model retains a timestamped backup under the matching
`.backups/` directory. Saves require the revision returned when the model was
loaded or last saved. Missing or stale revisions return `409`. AI apply and
rollback also enforce revisions. Rapid saves keep separate recovery copies.

Add `--static-only` to serve the public app assets with all API routes disabled.
The browser can still download model JSON. This mode does not support server
writes, provider calls, debug ingestion, or collaboration.

### Network access

Connected mode binds to `127.0.0.1` and is intended for a trusted workstation.
It has no user authentication or authorization. Non-loopback connected binds
require `--allow-remote`; that option does not add access controls. Add those
controls before exposing connected mode on a shared network or through a proxy.

The server restricts static requests to public application assets. Private paths,
keys, dotfiles, logs, backups, and directory listings are excluded. Use this server
instead of `python -m http.server` at the repository root, which would expose
files outside the app's public assets.

## AI configuration

Open **AI Support** in Edit or Tests. It supports generation, validation,
improvement, repair, **Explain selection**, and **Improve selection**. Select
classes or a link before using a selection operation.

Choose a provider and model in the UI. **Refresh Available Models** retrieves
IDs available to the account or local Ollama installation, preserves the current
selection, and does not generate text. The shared capability catalog is
[`js/hbds_ai_providers.json`](../js/hbds_ai_providers.json); discovered IDs alone
do not establish support for structured output or reasoning options.

| Provider | Server credential |
| --- | --- |
| OpenAI | `OPENAI_API_KEY` |
| Anthropic / Claude | `ANTHROPIC_API_KEY` |
| Custom OpenAI-compatible | `HBDS_AI_CUSTOM_API_KEY`, when required by the endpoint |
| Local / Ollama | No API key; configure the local base URL in the UI |
| ChatGPT / Manual | No API key; prepare a prompt, then paste and validate the response |

For server credentials, set `HBDS_AI_ENABLED=1` and the appropriate environment
variable before starting the server. Alternatively, enter a transient key in
the UI for a provider that accepts one. Ollama calls require the server flag.
Manual mode prepares prompts without calling a provider.

Supported providers can return JSON Schema output. Deep or large extension
schemas may fall back to JSON mode. Custom endpoints have explicit format
options. Every response still passes local structural, reference, inheritance,
and enabled semantic-profile validation before it can be applied.

### Review and privacy

- Review each proposed change in **AI Changes Preview**. A selection that leaves
  invalid references cannot be applied. Renames and deletions require confirmation.
- **Preview on Canvas** stays local. **Apply and Save** updates the selected model;
  **Apply as New Model** creates a separate file. **Rollback AI Apply** restores
  the prior state or removes the newly created model.
- Applying is blocked if the local model changed after the request. Focused edits
  preserve unrelated entities, IDs, and containment.
- Keys remain in server environment variables or page memory, outside model
  files, exports, drafts, and diagnostics. Editing and selection requests send
  the current model to the selected provider for context.
- Cancel discards late results locally. A request already sent to a provider may
  still finish and incur charges. Ambiguous mutating requests are not retried
  automatically.

### Request limits

| Environment variable | Default |
| --- | --- |
| `HBDS_AI_MAX_TOKENS` | 8192 for the OpenAI and Anthropic request paths; clamped to 256–32768 |
| `HBDS_AI_REQUEST_MAX_BYTES` | 512 KiB |
| `HBDS_AI_RESPONSE_MAX_BYTES` | 8 MiB |
| `HBDS_AI_TIMEOUT_SECONDS` | 60 seconds |

Public providers require HTTPS. Loopback HTTP is permitted for local providers
such as Ollama. Private-network endpoints require HTTPS and explicit opt-in with
`HBDS_AI_ALLOW_PRIVATE_URLS=1`. Redirects are revalidated; unsafe schemes and
URLs containing credentials are rejected.

For incomplete output, reduce the request size or increase the token limit.
The UI distinguishes credential/access errors, unavailable models, rate limits,
timeouts, refusals, and incomplete replies. Provider error bodies are not echoed.

## Collaboration and API

Open the same model in two connected Edit or Tests sessions to share live drafts.
The collaboration panel shows other users, their diagrams, and property-level
differences. **Merge Both** combines compatible edits; **Use Theirs** and
**Keep Mine** resolve other conflicts. Complex simultaneous edits may require
a manual choice.

With the server running, open `/api/docs` for readable API documentation or
`/api/openapi.json` for its machine-readable specification. These describe model
loading/saving/deletion, scoped test files, revision-checked operations, drafts,
Server-Sent Events, and AI provider/prompt/apply/rollback endpoints. The separate
[functor API proposal](../openapi_docs/README.md) documents a proposed contract.

See [Testing and Integration](../Test_and_Integration.md) for request examples,
workflow checks, and troubleshooting.
