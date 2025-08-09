"""
PhoneLog AI Workers - AI-powered file parsing and processing workers

This package provides machine learning workers for:
- Document layout classification
- Multi-format file parsing (PDF, CSV, CDR text files)
- Data validation and normalization
- Background job processing with Celery/Redis
"""

__version__ = "1.0.0"
__author__ = "PhoneLog AI Team"

from .queue.celery_app import celery_app
from .ml.layout_classifier import LayoutClassifier
from .parsers.pdf_parser import PDFParser
from .parsers.csv_parser import CSVParser
from .parsers.cdr_parser import CDRParser

__all__ = [
    "celery_app",
    "LayoutClassifier", 
    "PDFParser",
    "CSVParser",
    "CDRParser",
]