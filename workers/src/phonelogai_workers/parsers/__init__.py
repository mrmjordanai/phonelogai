"""
Parser module initialization

This module provides access to the enhanced parser implementations for production use.
All parsers now delegate to enhanced implementations for better performance and features.
"""

from .pdf_parser import PDFParser
from .csv_parser import CSVParser  
from .cdr_parser import CDRParser

# Global parser instances for use by the task framework
pdf_parser = PDFParser()
csv_parser = CSVParser()
cdr_parser = CDRParser()

__all__ = [
    'pdf_parser',
    'csv_parser', 
    'cdr_parser',
    'PDFParser',
    'CSVParser',
    'CDRParser'
]