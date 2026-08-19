(function () {
    const maxFileBytes = 4 * 1024 * 1024;
    const maxRequestBytes = 8 * 1024 * 1024;
    const allowedTypes = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

    const readFile = (file) => new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve({ name: file.name, type: file.type, data: reader.result });
        reader.onerror = () => reject(new Error(`Could not read ${file.name}`));
        reader.readAsDataURL(file);
    });

    const uploadFiles = async (fileList) => {
        const files = Array.from(fileList || []).filter(Boolean);
        if (!files.length) return [];

        const invalid = files.find((file) => !allowedTypes.has(file.type) || file.size > maxFileBytes);
        if (invalid) {
            throw new Error(`${invalid.name} must be a JPG, PNG, WEBP, or GIF smaller than 4 MB.`);
        }
        if (files.reduce((total, file) => total + file.size, 0) > maxRequestBytes) {
            throw new Error("Please keep the total upload size below 8 MB.");
        }

        const token = localStorage.getItem("token");
        if (!token) throw new Error("Your session has expired. Please log in again.");

        const encodedFiles = await Promise.all(files.map(readFile));
        const response = await fetch("/api/events/uploads", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${token}`
            },
            body: JSON.stringify({ files: encodedFiles })
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok || !data.success) throw new Error(data.message || "Images could not be uploaded");
        return Array.isArray(data.files) ? data.files : [];
    };

    const bindPreview = (input, preview) => {
        if (!input || !preview) return;
        input.addEventListener("change", () => {
            const file = input.files?.[0];
            if (!file) {
                preview.hidden = true;
                preview.removeAttribute("src");
                return;
            }
            preview.src = URL.createObjectURL(file);
            preview.hidden = false;
        });
    };

    const bindFileNames = (input, target) => {
        if (!input || !target) return;
        input.addEventListener("change", () => {
            const files = Array.from(input.files || []);
            target.textContent = files.length
                ? files.map((file) => file.name).join(", ")
                : "No gallery images selected";
        });
    };

    window.EventlyEventForm = { uploadFiles, bindPreview, bindFileNames };
})();
