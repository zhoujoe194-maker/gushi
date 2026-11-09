"""Package deployable source without local databases, credentials, or build output.

Usage: python3 scripts/package-release.py /absolute/path/release.zip
"""
import hashlib
import json
from pathlib import Path
import sys
import zipfile

ROOT = Path(__file__).resolve().parents[1]
ROOT_FILES = [
    '.dockerignore', '.gitignore', '.npmrc', 'Dockerfile', 'README.md',
    'cloudflare-env.d.ts', 'components.json', 'compose.yaml', 'drizzle.config.ts',
    'eslint.config.mjs', 'next-env.d.ts', 'next.config.ts', 'package-lock.json',
    'package.json', 'postcss.config.mjs', 'tsconfig.json', 'vite.config.ts', '部署说明.md',
]
SOURCE_DIRS = ['app', 'components', 'scripts', 'drizzle', 'lib', 'build', 'public',
               'tests', 'db', 'deploy', 'examples', 'runtime', 'vendor', '.openai', 'hooks']
FORBIDDEN_ROOTS = {'work', 'outputs', 'data', 'backups', 'node_modules', '.git'}


def safe(relative):
    # Only the repository-root work/ is temporary. app/work/ is a required route.
    return (relative.parts[0] not in FORBIDDEN_ROOTS
            and not relative.parts[0].startswith('.next')
            and '__pycache__' not in relative.parts
            and not relative.name.startswith(('.env', '.dev.vars'))
            and not any(token in relative.name for token in ['.sqlite', '.db-wal', '.db-shm'])
            and relative.suffix not in {'.log', '.pyc', '.db', '.pem', '.key'})


destination = Path(sys.argv[1]).resolve()
destination.parent.mkdir(parents=True, exist_ok=True)
files = {ROOT / name for name in ROOT_FILES}
for directory in SOURCE_DIRS:
    files.update(p for p in (ROOT / directory).rglob('*') if p.is_file())
files = sorted(p for p in files if safe(p.relative_to(ROOT)))
required = [ROOT / 'app/work/[role]/page.tsx', ROOT / 'app/api/messages/route.ts',
            ROOT / 'drizzle/0007_project_groups.sql', ROOT / 'scripts/selfhost-admin.mjs',
            ROOT / 'app/setup/page.tsx', ROOT / 'app/api/setup/route.ts',
            ROOT / 'app/api/sales/route.ts', ROOT / 'app/sales/center.tsx',
            ROOT / 'app/sales/model.ts', ROOT / 'drizzle/0008_sales_performance.sql',
            ROOT / 'drizzle/0009_task_images.sql', ROOT / 'app/api/tasks/images/[id]/route.ts',
            ROOT / 'app/sales/demo.ts', ROOT / 'app/task-image-gallery.tsx',
            ROOT / 'drizzle/0010_sales_monthly_reports.sql', ROOT / 'app/sales/report-fields.tsx',
            ROOT / 'app/api/health/route.ts', ROOT / 'scripts/selfhost-healthcheck.mjs',
            ROOT / 'app/api/meetings/route.ts', ROOT / 'drizzle/0011_management_meetings.sql',
            ROOT / 'app/business-model.ts', ROOT / 'app/project-business.tsx',
            ROOT / 'tests/release-checks.mjs', ROOT / 'deploy/上线验收与更新.md']
assert all(p in files and p.is_file() for p in required), 'Required application files missing'
temporary = destination.with_suffix('.zip.tmp')
with zipfile.ZipFile(temporary, 'w', zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
    for source in files:
        assert source.is_file() and not source.is_symlink(), source
        archive.write(source, 'gushi-workspace/' + source.relative_to(ROOT).as_posix())
with zipfile.ZipFile(temporary) as archive:
    assert archive.testzip() is None, 'Archive integrity failure'
    for source in files:
        assert archive.read('gushi-workspace/' + source.relative_to(ROOT).as_posix()) == source.read_bytes(), source
temporary.replace(destination)
print(json.dumps({'archive': destination.name, 'files': len(files),
                  'bytes': destination.stat().st_size,
                  'sha256': hashlib.sha256(destination.read_bytes()).hexdigest()}, ensure_ascii=False, indent=2))
