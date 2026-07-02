#!/bin/bash
cd "$(dirname "$0")"
echo "Starting Job Search Dashboard at http://localhost:8000"
.venv/bin/python app.py
