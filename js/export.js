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

function createDataSheet(XLSX, title, rows) {
	const values = [
		[title],
		[`Exported ${new Date().toLocaleString()}`],
		[],
		columns.map(([, label]) => label),
		...rows.map(note => columns.map(([key]) => {
			if (key === 'recordType') return note.source === 'recruiter-re-audit' ? 'Recruiter RE-audit' : 'Company research';
			if (key === 'attachment') return note.attachmentPath ? 'Yes' : 'No';
			if (key === 'submittedAt' || key === 'updatedAt') return displayDate(note[key]);
			return note[key] || '';
		}))
	];
	const sheet = XLSX.utils.aoa_to_sheet(values);
	sheet['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: columns.length - 1 } }];
	sheet['!cols'] = columns.map(([, , width]) => ({ wch: width }));
	sheet['!autofilter'] = { ref: `A4:N${Math.max(4, values.length)}` };
	sheet['!views'] = [{ state: 'frozen', ySplit: 4, topLeftCell: 'A5', activePane: 'bottomLeft' }];
	return sheet;
}

export async function downloadExcel(notes) {
	const XLSX = await import('xlsx');
	const records = notes.filter(note => note.source !== 'recruiter-re-audit');
	const audits = notes.filter(note => note.source === 'recruiter-re-audit');
	const workbook = XLSX.utils.book_new();
	const summary = XLSX.utils.aoa_to_sheet([
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
	summary['!merges'] = [
		{ s: { r: 0, c: 0 }, e: { r: 0, c: 1 } },
		{ s: { r: 8, c: 1 }, e: { r: 8, c: 5 } }
	];
	summary['!cols'] = [{ wch: 32 }, { wch: 76 }];
	XLSX.utils.book_append_sheet(workbook, summary, 'Summary');
	XLSX.utils.book_append_sheet(workbook, createDataSheet(XLSX, 'Company research', records), 'Companies');
	XLSX.utils.book_append_sheet(workbook, createDataSheet(XLSX, 'Recruiter RE-audits', audits), 'Recruiter audits');
	workbook.Props = {
		Title: 'Recruiter Hub Info Hub export',
		Subject: 'Company research and recruiter referrals',
		Author: 'Recruiter Hub'
	};
	const date = new Date().toISOString().slice(0, 10);
	XLSX.writeFile(workbook, `RecruiterHub-Info-${date}.xlsx`);
}
