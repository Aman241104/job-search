import pytest

from agents.job_import import JobImportError, fetch_page, from_json_ld

PAGE = """<html><head><script type="application/ld+json">
{"@context": "https://schema.org", "@graph": [{"@type": "Organization", "name": "x"},
 {"@type": "JobPosting", "title": "Frontend Developer", "datePosted": "2026-10-01",
  "description": "<p>Build with <b>React</b> &amp; Next.js</p>",
  "hiringOrganization": {"@type": "Organization", "name": "Acme"},
  "jobLocation": {"@type": "Place", "address": {"addressLocality": "Ahmedabad", "addressCountry": "IN"}},
  "baseSalary": {"currency": "INR", "value": {"minValue": 600000, "maxValue": 900000, "unitText": "YEAR"}}}]}
</script></head><body></body></html>"""


def test_json_ld_job_posting():
    job = from_json_ld(PAGE)
    assert job["title"] == "Frontend Developer" and job["company"] == "Acme"
    assert job["description"] == "Build with React & Next.js"
    assert job["location"] == "Ahmedabad, IN"
    assert job["salary"] == "₹6.0L - ₹9.0L / yr"
    assert from_json_ld("<html></html>") is None


@pytest.mark.parametrize("url", ["http://169.254.169.254/latest/meta-data/", "http://localhost:8000/",
                                 "http://10.0.0.1/", "http://[::1]/", "file:///etc/passwd", "ftp://example.com/"])
def test_fetch_page_refuses_non_public_targets(url):
    with pytest.raises(JobImportError):
        fetch_page(url)
