const columns = [
	['company', 'Company', 28],
	['site', 'Website', 32],
	['offer', 'What they offer', 36],
	['job', 'Career notes', 36],
	['notes', 'Research notes / pitch', 48],
	['status', 'Status', 16],
	['recordType', 'Record type', 20],
	['recruiterName', 'Recruiter', 24],
	['referralName', 'Employee referral', 24],
	['referralEmail', 'Referral email', 32],
	['referralContext', 'Referral context', 42],
	['submittedAt', 'Submitted', 22],
	['updatedAt', 'Last updated', 22],
	['attachment', 'Attachment included', 20]
];

function displayDate(value) {
	if (!value) return '';
	const date = value instanceof Date ? value : new Date(value);
	return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString();
}

function createDataSheet(workbook, title, rows) {
	const sheet = workbook.addWorksheet(title);
	sheet.addRow([title]);
	sheet.mergeCells(1, 1, 1, columns.length);
	sheet.addRow([`Exported ${new Date().toLocaleString()}`]);
	sheet.addRow([]);
	sheet.addRow(columns.map(([, label]) => label));
	columns.forEach(([, , width], index) => {
		sheet.getColumn(index + 1).width = width;
	});
	rows.forEach(note => sheet.addRow(columns.map(([key]) => {
		if (key === 'recordType') return note.source === 'recruiter-re-audit' ? 'Recruiter RE-audit' : 'Company research';
		if (key === 'attachment') return note.attachmentPath ? 'Yes' : 'No';
		if (key === 'submittedAt' || key === 'updatedAt') return displayDate(note[key]);
		return note[key] || '';
	})));
	sheet.autoFilter = {
		from: { row: 4, column: 1 },
		to: { row: Math.max(4, rows.length + 4), column: columns.length }
	};
	sheet.views = [{ state: 'frozen', ySplit: 4, topLeftCell: 'A5', activePane: 'bottomLeft' }];
	return sheet;
}

export async function downloadExcel(notes) {
	const { default: ExcelJS } = await import('exceljs');
	const records = notes.filter(note => note.source !== 'recruiter-re-audit');
	const audits = notes.filter(note => note.source === 'recruiter-re-audit');
	const workbook = new ExcelJS.Workbook();
	const summary = workbook.addWorksheet('Summary');
	summary.addRows([
		['Recruiter Hub | Info Hub export'],
		[`Exported ${new Date().toLocaleString()}`],
		[],
		['Overview', 'Count'],
		['Company research records', records.length],
		['Recruiter RE-audits', audits.length],
		['Total records', notes.length],
		[],
		['Data handling', 'This workbook contains the Info Hub records at the time of export. Keep it in a secure location.']
	]);
	summary.mergeCells('A1:B1');
	summary.mergeCells('B9:F9');
	summary.getColumn(1).width = 32;
	summary.getColumn(2).width = 76;
	createDataSheet(workbook, 'Companies', records);
	createDataSheet(workbook, 'Recruiter audits', audits);
	workbook.creator = 'Recruiter Hub';
	workbook.title = 'Recruiter Hub Info Hub export';
	workbook.subject = 'Company research and recruiter referrals';
	const date = new Date().toISOString().slice(0, 10);
	const buffer = await workbook.xlsx.writeBuffer();
	const downloadUrl = URL.createObjectURL(new Blob([buffer], {
		type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
	}));
	const link = document.createElement('a');
	link.href = downloadUrl;
	link.download = `RecruiterHub-Info-${date}.xlsx`;
	document.body.append(link);
	link.click();
	link.remove();
	setTimeout(() => URL.revokeObjectURL(downloadUrl), 1000);
}
