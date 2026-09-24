"""
Post-generation checks for AI-written CVs and cover letters.

The prompts already say "don't invent skills" — the model still did (jQuery,
Redux, React Native, "millions of Spark jobs"), because it mirrors the job
description. So instead of trusting the prompt, every technology the output
mentions is checked against the candidate's own resume data, and anything
unsupported is removed before a PDF is ever written.
"""
import json
import re

# Technologies a JD commonly asks for. Anything in this list that the output
# mentions but the resume never does is treated as invented.
TECH_TERMS = [
    "react native", "redux", "redux toolkit", "zustand", "mobx", "jquery", "angular", "angularjs", "vue", "vue.js",
    "nuxt", "svelte", "sveltekit", "ember", "backbone", "graphql", "apollo", "trpc", "grpc", "websockets", "socket.io",
    "aws", "azure", "lambda", "ec2", "s3", "dynamodb", "cloudformation", "kubernetes", "k8s", "helm", "terraform",
    "ansible", "jenkins", "circleci", "spark", "hadoop", "kafka", "airflow", "databricks", "snowflake", "bigquery",
    "redis", "elasticsearch", "opensearch", "cassandra", "neo4j", "oracle", "sql server", "django", "flask",
    "spring", "spring boot", ".net", "asp.net", "c#", "php", "laravel", "ruby", "rails", "golang", "rust", "swift",
    "kotlin", "flutter", "dart", "tensorflow", "pytorch", "keras", "scikit-learn", "pandas", "numpy", "opencv",
    "hugging face", "langchain", "llamaindex", "tableau", "power bi", "sass", "scss", "bootstrap", "material ui",
    "mui", "chakra", "styled-components", "webpack", "cypress", "selenium", "storybook", "jira", "auth0", "okta",
    "stripe", "shopify liquid", "wordpress", "salesforce", "sap", "unity", "unreal",
]
_TERM_RE = {t: re.compile(rf"(?<![\w.#+-]){re.escape(t)}(?![\w#+-])", re.I) for t in TECH_TERMS}


def resume_corpus(resume: dict, extra: dict | None = None) -> str:
    """Everything the candidate's resume (and detailed project notes) says,
    lower-cased — the ground truth a claim has to appear in."""
    return (json.dumps(resume, ensure_ascii=False) + " " + json.dumps(extra or {}, ensure_ascii=False)).lower()


def unsupported_terms(text: str, corpus: str) -> list[str]:
    found = [t for t, rx in _TERM_RE.items() if rx.search(text) and not rx.search(corpus)]
    # "redux toolkit" also matches "redux" — report the longest form only
    return sorted({t for t in found if not any(o != t and t in o for o in found)})


def _strip_from_list(line: str, term: str) -> str:
    """Remove a term from a comma/and-separated list inside a line."""
    rx = _TERM_RE[term].pattern
    for pat in (rf",\s*{rx}(?=\s*[,.;)]|\s*$)", rf"{rx}\s*,\s*", rf"\s+and\s+{rx}", rf"{rx}\s+and\s+", rx):
        new = re.sub(pat, "", line, count=1, flags=re.I)
        if new != line:
            return re.sub(r"\s{2,}", " ", new).replace(" ,", ",").replace("(, ", "(")
    return line


def sanitize_cv(markdown: str, resume: dict, corpus: str) -> tuple[str, list[str]]:
    """Returns (clean markdown, removed terms). Skills lists lose the invented
    items; a bullet that is *about* an invented technology is dropped whole,
    since trimming one word out of it would leave a false sentence."""
    removed: set[str] = set()
    out = []
    cgpa = next((str(e.get("cgpa")) for e in resume.get("education", []) if e.get("cgpa")), None)
    for line in markdown.splitlines():
        if cgpa:
            line = re.sub(r"(CGPA[:\s]*)\d+(?:\.\d+)?", rf"\g<1>{cgpa}", line)
        bad = unsupported_terms(line, corpus)
        if bad:
            removed.update(bad)
            if line.lstrip().startswith(("- ", "* ")):
                continue  # drop the whole claim
            for t in bad:
                line = _strip_from_list(line, t)
            if re.fullmatch(r"\s*\*\*[^*]+:\*\*\s*", line):
                continue  # a skills category left empty
        out.append(line)
    return "\n".join(out), sorted(removed)


def sanitize_cover_letter(text: str, corpus: str) -> tuple[str, list[str]]:
    bad = unsupported_terms(text, corpus)
    for t in bad:
        # Remove list mentions; a sentence that still names it is dropped.
        text = _strip_from_list(text, t)
        if _TERM_RE[t].search(text):
            text = " ".join(s for s in re.split(r"(?<=[.!?])\s+", text) if not _TERM_RE[t].search(s))
    return text, bad


def is_failed(text: str) -> bool:
    return not text or "generation failed" in text.lower()
