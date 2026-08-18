export function classifyWebsite(value: string):
	| {
			website: string;
			facebook?: string;
			instagram?: string;
	  }
	| undefined {
	const trimmed = value.trim();

	if (!trimmed) {
		return undefined;
	}

	let url: URL;

	try {
		url = new URL(trimmed);
	} catch {
		return undefined;
	}

	const hostname = url.hostname.toLowerCase().replace(/^www\./, "");

	if (hostname === "facebook.com" || hostname.endsWith(".facebook.com")) {
		return {
			website: trimmed,
			facebook: trimmed,
		};
	}

	if (hostname === "instagram.com" || hostname.endsWith(".instagram.com")) {
		return {
			website: trimmed,
			instagram: trimmed,
		};
	}

	return {
		website: trimmed,
	};
}
