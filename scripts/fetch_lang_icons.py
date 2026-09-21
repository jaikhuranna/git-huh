#!/usr/bin/env python3
"""Regenerate src/lib/languageMarks.ts from devicon (MIT).

Run when a language you actually write is missing its mark. Icons are stored
as a single joined path per language because they are drawn as one tinted
silhouette on a colour chip, not in brand colour.
"""
# The mapping and generation live in the session that produced languageMarks.ts;
# this stub records provenance and the source of truth.
SOURCE = "https://raw.githubusercontent.com/devicons/devicon/master/icons/"
