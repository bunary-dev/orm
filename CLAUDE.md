# @bunary/orm — agent instructions

## Definition of done

A PR that changes anything a user of the package can observe (public API,
types, options, defaults, behaviour, error messages) is not done until, in the
same PR:

- `docs/index.md` documents the change: new exports, options and behaviour get
  a section or an updated example; removed or changed behaviour is corrected
  wherever the docs mention it.
- `README.md` is updated if it covers the changed area.
- `CHANGELOG.md` has an entry under `## [Unreleased]` (Breaking / Added /
  Changed / Fixed), ending with the issue number, e.g. `(#12)`. If there is no
  `## [Unreleased]` section yet, add one above the latest release.

Internal-only changes (tests, refactors with no observable effect, CI) need a
CHANGELOG entry only if they fix a user-visible bug.

### Version bump

Every PR that changes `src/` or anything else shipped in the package (the
`files` in `package.json`, its exports, dependencies or peer dependencies)
also bumps `package.json` `version` by semver, in the same PR:

- patch for fixes, minor for features (`0.2.0` → `0.2.1` / `0.3.0`);
- while the version is `0.x`, a breaking change bumps the minor, not the major;
- on a prerelease, bump the prerelease number instead (`1.0.0-rc.N` →
  `1.0.0-rc.N+1`), whatever the kind of change.

Then move the `## [Unreleased]` CHANGELOG entries (the PR's own and any older
ones still there) under a new `## [x.y.z] - YYYY-MM-DD` heading for that
version.

Why: `Tag release on main` tags each push to `main` as `v<version>` from
`package.json`. Without a bump that tag already exists, so tag-release fails
on the duplicate tag (or, where the workflow tolerates it, skips tagging) and
the change is never released.

Docs-only, test-only and CI-only changes do not bump the version.

## Out of scope

No npm publishing and no CI/CD or release workflows: publishing for all
`@bunary/*` packages is on hold until the maintainer says otherwise.
