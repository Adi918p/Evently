const link = document.getElementById('link');

if (link && window.QRCode) {
    const data = {
        ticketId: "EVT" + crypto.randomUUID().slice(0, 10),
        eventId: "DJN2026"
    };

    QRCode.toDataURL(
        JSON.stringify(data),
        (err, code) => {
            if (err) {
                console.error(err);
                return;
            }

            const qrImage = document.getElementById("qrcode");
            if (qrImage) qrImage.src = code;
            link.href = code;
            link.download = "ticket.png";
        }
    );
}
