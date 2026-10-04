# RCA — Deploy failed at pull_source: missing `backend/.env`

**Deployment:** renke-staging (`af6c643d-9e58-420a-a026-daf65409eee7`)
**Template:** fastapi_react_mongo_shadcn_base_image (farm) · frontend_type: cloudflare · tier_0
**Failed runs:** 75855319-287d-419d-8c2a-6dc5bd8f95d5 (initial), a54a0add-d369-405c-a600-efafe9d9d041 (retry)

## What happened
Both runs failed at the **pull_source** step while preparing the build context. The deployer reads the env files declared in `config.yaml` `env_paths` (for a farm app: `backend/.env` and `frontend/.env`). `backend/.env` does not exist in the source/agent-env, so the read aborts the whole pipeline before build:

```
prepare build context: read envs: read env file backend/.env:
open /tmp/agent-env-.../app/backend/.env: no such file or directory (PathError)
```

## Root cause
The preview/source environment is **missing `/app/backend/.env`**. For a farm (FastAPI + React + Mongo) app this file is required and normally holds the backend env vars (e.g. `MONGO_URL`, `DB_NAME`, and any app-specific keys). Its absence means pull_source cannot assemble the build context.

## Verification
- `describe_deployment_state` / `get_step_status`: build/pull_source step error is the missing `backend/.env`.
- `spawn_eph_pod`: returned `eph_source_missing` — no source archive exists because pull_source never completed, so the source could not be inspected in a sandbox.
- One protocol-sanctioned `resume_pipeline` retry was fired (run a54a0add) — it failed identically, proving the failure is deterministic (a missing file), not a transient copy blip.

## Fix (owner: E1 / source environment)
Create `/app/backend/.env` in the preview/source environment with the backend configuration the app expects. At minimum a farm backend needs:
```
MONGO_URL=mongodb://localhost:27017
DB_NAME=<app_db_name>
```
plus any app-specific keys the backend reads via `os.environ`. (Production `MONGO_URL`/`DB_NAME` are injected by the platform at deploy time, but the file must still exist for pull_source to succeed.) If a `frontend/.env` is also expected, confirm it is present too. Then re-trigger the deploy.

## Not done / why
- No manifest edit was applied. Dropping `backend/.env` from `config.yaml` `env_paths` would mask the missing file and risk shipping a backend with no env configuration — the correct fix is to restore the file in source.
- No further `resume_pipeline` — redeploying the same source fails identically until the file is created.
