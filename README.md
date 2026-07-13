# ThreadFlow Textile Order Manager

Open `index.html` in a browser. It is a working browser-based prototype with data stored on that browser using local storage.

Features included:
- New-order entry limited to order details.
- Party/date/status filtered order register.
- Party-wise pending and complete PDF reports.
- Dispatch entry and dispatch PDF report.
- Party-wise/date-wise printable report maker.
- Excel import that appends records without deleting existing data, plus Excel export.

For PDF buttons, the browser opens its print screen. Select **Save as PDF** there.

The Excel buttons use SheetJS loaded from a public CDN, so first use needs an internet connection. Imported files should contain `PARTY NAME` and `ORDER QUANTITY`; the supplied workbook imports directly.
