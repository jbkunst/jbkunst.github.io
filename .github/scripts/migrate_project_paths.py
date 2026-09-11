from pathlib import Path
import re

ROOT = Path.cwd()
POSTS = ROOT / "blog" / "posts"

CHUNK_RE = re.compile(r"(^```\{r[^\n]*\}\s*\n)(.*?)(^```\s*$)", re.M | re.S)
STRING_RE = re.compile(r"(?P<q>['\"])(?P<value>[^'\"\n]+)(?P=q)")
HERE_RE = re.compile(r"here::here\((.*?)\)", re.S)


def repo_path(path: Path) -> str:
    return path.relative_to(ROOT).as_posix()


def literal_here_to_path(match: re.Match) -> str:
    args = match.group(1)
    parts = re.findall(r"(['\"])(.*?)\1", args, re.S)
    if not parts:
        return match.group(0)

    stripped = re.sub(r"(['\"])(.*?)\1", "", args, flags=re.S)
    if stripped.replace(",", "").strip():
        return match.group(0)

    return '"' + "/".join(value for _, value in parts) + '"'


def resolve_parent_relative(value: str, post_dir: Path):
    if not value.startswith("../"):
        return None
    target = (post_dir / value).resolve()
    try:
        target.relative_to(ROOT)
    except ValueError:
        return None
    return repo_path(target)


def migrate_code(code: str, post_dir: Path) -> str:
    prefix = repo_path(post_dir)
    child_dirs = sorted(
        path.name for path in post_dir.iterdir()
        if path.is_dir() and not path.name.startswith(".")
    )

    code = re.sub(
        r"source\(\s*here::here\(\s*['\"]blog['\"]\s*,\s*['\"]_R['\"]\s*,\s*['\"]post_setup\.R['\"]\s*\)\s*\)",
        'source("blog/_R/post_setup.R")',
        code,
        flags=re.S,
    )
    code = code.replace('source("../../_R/post_setup.R")', 'source("blog/_R/post_setup.R")')
    code = code.replace("source('../../_R/post_setup.R')", 'source("blog/_R/post_setup.R")')
    code = HERE_RE.sub(literal_here_to_path, code)

    for child in child_dirs:
        escaped = re.escape(child)

        # Direct literals such as "data/foo.csv" or "images/preview.png".
        code = re.sub(
            rf"(?P<q>['\"])(?P<value>{escaped}/[^'\"\n]+)(?P=q)",
            lambda m: f"{m.group('q')}{prefix}/{m.group('value')}{m.group('q')}",
            code,
        )

        # file.path("data", ...), dir.create("images", ...), etc.
        code = re.sub(
            rf"file\.path\(\s*(['\"]){escaped}\1\s*,",
            lambda m: f'file.path({m.group(1)}{prefix}/{child}{m.group(1)},',
            code,
        )
        code = re.sub(
            rf"dir\.create\(\s*(['\"]){escaped}\1(?=\s*[,\)])",
            lambda m: f'dir.create({m.group(1)}{prefix}/{child}{m.group(1)}',
            code,
        )

        # Variables such as images_dir <- "images" or data_path <- "data".
        code = re.sub(
            rf"(?mi)^(\s*[A-Za-z0-9_.]*(?:dir|path|file|folder|fldr)[A-Za-z0-9_.]*\s*<-\s*)(['\"]){escaped}\2\s*$",
            lambda m: f"{m.group(1)}{m.group(2)}{prefix}/{child}{m.group(2)}",
            code,
        )

    # Resolve any remaining ../ paths that still point inside the repository.
    def replace_parent_path(match: re.Match) -> str:
        value = match.group("value")
        resolved = resolve_parent_relative(value, post_dir)
        if resolved is None:
            return match.group(0)
        return f'{match.group("q")}{resolved}{match.group("q")}'

    code = STRING_RE.sub(replace_parent_path, code)

    # Existing post-local files referenced by bare names also become root-relative.
    def replace_existing_local(match: re.Match) -> str:
        value = match.group("value")
        if (
            value.startswith(("http://", "https://", "blog/", "/", "#"))
            or "://" in value
            or value.startswith("../")
        ):
            return match.group(0)
        local = post_dir / value
        if local.is_file():
            return f'{match.group("q")}{repo_path(local)}{match.group("q")}'
        return match.group(0)

    return STRING_RE.sub(replace_existing_local, code)


def migrate_qmd(qmd: Path) -> bool:
    original = qmd.read_text(encoding="utf-8")

    def repl(match: re.Match) -> str:
        return match.group(1) + migrate_code(match.group(2), qmd.parent) + match.group(3)

    migrated = CHUNK_RE.sub(repl, original)
    if migrated == original:
        return False
    qmd.write_text(migrated, encoding="utf-8")
    return True


def update_quarto() -> bool:
    path = ROOT / "_quarto.yml"
    text = path.read_text(encoding="utf-8")
    if "  execute-dir: project\n" in text:
        return False
    marker = "  output-dir: docs\n"
    if marker not in text:
        raise SystemExit("Could not locate project.output-dir in _quarto.yml")
    path.write_text(text.replace(marker, marker + "  execute-dir: project\n", 1), encoding="utf-8")
    return True


def update_agents() -> bool:
    path = ROOT / "AGENTS.md"
    text = path.read_text(encoding="utf-8")
    text = text.replace('source("../../_R/post_setup.R")', 'source("blog/_R/post_setup.R")')

    section = '''## Datos y recursos

- Guardar los datos específicos de un post dentro de la carpeta de ese post, idealmente en `data/`.
- `_quarto.yml` define `execute-dir: project`; por lo tanto, todas las rutas usadas por código R se escriben relativas a la raíz del repositorio.
- Para datos, imágenes o archivos generados por un post dentro de chunks R, usar rutas explícitas como `blog/posts/<carpeta-del-post>/data/...` y `blog/posts/<carpeta-del-post>/images/...`.
- No usar `setwd()`, `here::i_am()` ni `here::here()` para resolver rutas del proyecto. Tampoco construir un `post_dir` solo para envolver una ruta sencilla.
- Las rutas de Markdown y front matter, por ejemplo `image: images/...`, `![](images/...)` o enlaces de descarga, siguen siendo relativas al documento y no deben convertirse a rutas desde la raíz.
- La fecha editorial del front matter puede cambiar sin renombrar la carpeta del post; las rutas R deben usar el nombre real y estable de la carpeta en el repositorio.
- No usar rutas absolutas del computador local ni rutas heredadas del repositorio antiguo.
- Evitar scraping remoto durante el render cuando el contenido es pequeño y estable. Guardar una copia local o definir los datos explícitamente.
- Mantener junto al post las imágenes y archivos que solo ese artículo utiliza.

Ejemplo:

```r
readr::read_csv("blog/posts/2016-03-01-bythmusters-mobile-phone-evolution/data/phones-2016.csv")
```

'''
    updated = re.sub(
        r"## Datos y recursos\n.*?(?=## Figuras y layout\n)",
        section,
        text,
        flags=re.S,
    )
    if updated == text:
        raise SystemExit("Could not update the Datos y recursos section in AGENTS.md")
    path.write_text(updated, encoding="utf-8")
    return True


def validate():
    problems = []
    for qmd in sorted(POSTS.glob("*/index.qmd")):
        text = qmd.read_text(encoding="utf-8")
        child_dirs = sorted(
            path.name for path in qmd.parent.iterdir()
            if path.is_dir() and not path.name.startswith(".")
        )
        for match in CHUNK_RE.finditer(text):
            code = match.group(2)
            if "here::here(" in code:
                problems.append(f"{repo_path(qmd)}: remaining here::here()")
            if "../../_R/post_setup.R" in code:
                problems.append(f"{repo_path(qmd)}: remaining ../../_R/post_setup.R")
            for child in child_dirs:
                escaped = re.escape(child)
                checks = (
                    rf"(['\"]){escaped}/",
                    rf"file\.path\(\s*(['\"]){escaped}\1\s*,",
                    rf"dir\.create\(\s*(['\"]){escaped}\1(?=\s*[,\)])",
                )
                if any(re.search(pattern, code) for pattern in checks):
                    problems.append(f"{repo_path(qmd)}: remaining post-relative {child}/ path")
            for literal in STRING_RE.finditer(code):
                value = literal.group("value")
                if value.startswith("../"):
                    problems.append(f"{repo_path(qmd)}: remaining parent-relative path {value}")
                if not value.startswith(("http://", "https://", "blog/", "/", "#")) and "://" not in value:
                    local = qmd.parent / value
                    if local.is_file():
                        problems.append(f"{repo_path(qmd)}: remaining local file path {value}")
    if problems:
        raise SystemExit("\n".join(sorted(set(problems))))


changed = []
if update_quarto():
    changed.append("_quarto.yml")
if update_agents():
    changed.append("AGENTS.md")

for qmd in sorted(POSTS.glob("*/index.qmd")):
    if migrate_qmd(qmd):
        changed.append(repo_path(qmd))

validate()

print("Changed files:")
for path in changed:
    print(f"- {path}")
