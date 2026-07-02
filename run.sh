#!/bin/bash
# Shortcut: ./run.sh find / ./run.sh train / ./run.sh track etc.
cd "$(dirname "$0")"
.venv/bin/python main.py "$@"
