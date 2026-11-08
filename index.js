/**
 * ark-plan-api — host entry.
 *
 * The substance of this plugin is the bundle patch in `cordis.patch.yml`, which
 * seeds the Ark provider routes onto the shared `llm-pi-ai` adapter. This module
 * exists so the package ships a real, importable entry artifact: DSH's plugin
 * market (`dshmarket`) refuses to promote a bundle whose declared entry is
 * missing (a source-only checkout would ERR_MODULE_NOT_FOUND at boot). It is a
 * valid, inert cordis plugin — nothing in the patch mounts it by name, so its
 * `apply` never runs; if a loader does import it, it is a harmless no-op.
 *
 * @module ark-plan-api
 */

export const name = 'ark-plan-api'

/** No-op: provider routes are contributed by cordis.patch.yml, not here. */
export function apply() {}
