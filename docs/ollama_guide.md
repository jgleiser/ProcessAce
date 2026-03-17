# Ollama Guide

This guide covers how to run ProcessAce with Ollama for local artifact generation, how to choose a deployment mode based on your operating system and hardware, and what is currently supported.

## Scope

ProcessAce supports Ollama as a first-class provider for artifact generation.

Current scope:

- Supported: local generation models for BPMN, SIPOC, RACI, and narrative artifacts
- Supported: bundled Docker Ollama, host-native Ollama, and Linux AMD ROCm Docker mode
- Not supported: Ollama as the transcription backend

Transcription remains on OpenAI-compatible speech-to-text providers. Ollama's current OpenAI compatibility layer does not provide the audio transcription endpoint that ProcessAce would need for the existing STT runtime.

## Deployment Modes

### 1. Cloud-Only Base Stack

Use this when you do not want local models and only plan to use cloud providers.

Before starting the stack, configure the required base variables in `.env`:

- `JWT_SECRET`
- `ENCRYPTION_KEY`
- `CORS_ALLOWED_ORIGINS`
- `REDIS_PASSWORD`

```bash
docker compose up -d --build
```

This starts only the application and Redis. No bundled `ollama` container is created.

If you use Linux bind mounts for `./data` and `./uploads`, make sure those host directories are writable by the container UID because the app runs as a non-root user.

### 2. Bundled CPU Ollama

Use this when you want local generation models through a bundled Ollama container.

```bash
docker compose -f docker-compose.yml -f docker-compose.ollama.yml up -d --build
```

Default container-to-container routing:

- `OLLAMA_BASE_URL_DEFAULT=http://ollama:11434/v1`
- `OLLAMA_PULL_HOST=http://ollama:11434`

This mode works on any machine that can run the ProcessAce Docker stack, but generation speed depends entirely on CPU performance and available RAM.

### 3. Windows Host Ollama

Use this when you run Docker Desktop on Windows and want Ollama to use host hardware directly.

Recommended for:

- Windows users in general
- Windows + AMD GPU hosts
- cases where Docker GPU passthrough is unavailable or unreliable

Steps:

1. Install and start Ollama on the Windows host.
2. Set the ProcessAce `.env` values:

```bash
CORS_ALLOWED_ORIGINS=http://localhost:3000
OLLAMA_BASE_URL_DEFAULT=http://host.docker.internal:11434/v1
OLLAMA_PULL_HOST=http://host.docker.internal:11434
```

3. Start ProcessAce normally:

```bash
docker compose up -d --build
```

In this mode, the app container talks to the host Ollama instance through `host.docker.internal`.

### 4. Linux AMD GPU Docker Mode

Use this when the Docker host is Linux and the machine has a ROCm-capable AMD GPU.

Start with:

```bash
docker compose -f docker-compose.yml -f docker-compose.ollama.yml -f docker-compose.ollama-amd.yml up -d --build
```

This switches the Ollama service to `ollama/ollama:rocm` and passes through:

- `/dev/kfd`
- `/dev/dri`

Host prerequisites:

- Linux host with Docker Engine
- ROCm-capable AMD GPU
- working AMD/ROCm driver stack on the host
- Docker access to `/dev/kfd` and `/dev/dri`

## Choosing Models

The App Settings page exposes a curated Ollama catalog in the `2.1 Local Model Manager` section.

The catalog includes:

- model size
- parameter size when known
- context window when known
- recommended hardware guidance

Use those hints as practical guidance, not hard limits. CPU-only execution is possible for smaller models, but latency may be high on weaker machines.

## Hardware Guidance

### CPU-first expectations

For CPU-only systems, prefer smaller models first. Larger models may still load, but generation latency can become impractical.

### RAM matters before peak CPU

Local model usability is constrained more by available RAM and model size than by raw CPU clock speed alone. If the machine is close to its memory limit, expect swapping, slower startup, or model eviction.

### GPU expectations

- Windows + AMD: prefer host Ollama
- Linux + AMD: use the ROCm Docker override
- No supported GPU path: use bundled CPU Ollama

## App Settings Workflow

1. Open `/app-settings.html`.
2. In `2. Default Model Selection`, choose `Ollama (Local)` as the LLM provider.
3. Confirm the Ollama base URL for your deployment mode.
4. Use `Load Models` to refresh installed Ollama models.
5. Use `2.1 Local Model Manager` to:
   - check installed status
   - download curated models
   - uninstall unused models
   - set an installed model as the active default

The `Use Model` action saves the model immediately, so the selected Ollama model becomes active without a separate extra step.

## Verification

### Basic connectivity

- Open App Settings
- Select `Ollama (Local)`
- Use `Load Models`
- Confirm the installed model list loads successfully

### Bundled Docker Ollama

```bash
docker compose exec ollama ollama list
docker compose exec ollama ollama ps
```

### Linux AMD Docker

```bash
docker compose exec ollama ls /dev/kfd /dev/dri
docker compose exec ollama ollama ps
```

### Windows Host Ollama

- confirm the settings page connects through `http://host.docker.internal:11434/v1`
- verify host CPU/GPU activity while Ollama is serving requests

## Troubleshooting

### The settings page still shows `http://ollama:11434/v1`

That value is expected only when the Ollama Docker override is enabled. If `.env` defines `OLLAMA_BASE_URL_DEFAULT`, the settings page should show that value after the app container is rebuilt. Rebuild with:

```bash
docker compose up -d --build
```

If you want bundled Ollama instead, start the stack with:

```bash
docker compose -f docker-compose.yml -f docker-compose.ollama.yml up -d --build
```

### Model downloads work but generation is slow

This usually means the model is running on CPU, or the selected model is too large for the machine's practical RAM/VRAM budget. Try a smaller model first.

### `ollama ps` shows nothing while a request fails quickly

That usually means the request never reached a runnable Ollama inference path. Check:

- the configured base URL
- whether the selected model is installed
- whether the request is generation, not transcription

### Transcription with Ollama fails

Ollama is not currently supported as the transcription backend in ProcessAce. Keep transcription on OpenAI-compatible speech-to-text providers.

## Related Docs

- [README](../README.md)
- [User Guide](./user_guide.md)
- [Architecture](./architecture.md)
- [Roadmap](./ROADMAP.md)
