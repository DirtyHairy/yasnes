let fileInput: HTMLInputElement | undefined;

export function openFile(handler: (data: Uint8Array, name: string) => void, accept?: string): void {
    if (fileInput) document.body.removeChild(fileInput);
    fileInput = document.createElement('input');

    fileInput.style.display = 'none';
    fileInput.type = 'file';
    fileInput.multiple = false;
    fileInput.accept = accept ?? '';

    document.body.appendChild(fileInput);

    fileInput.addEventListener('change', (e) => {
        const target = e.target as HTMLInputElement;
        const file = target.files?.[0];

        if (!file) return;

        const reader = new FileReader();
        reader.onload = (): void => handler(new Uint8Array(reader.result as ArrayBuffer), file.name);
        reader.onerror = (error): void => console.error(`failed to read file ${file.name}`, error);

        reader.readAsArrayBuffer(file);
    });

    fileInput.click();
}
