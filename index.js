require('dotenv').config();
const express = require('express');
const { ethers } = require('ethers');
const cors = require('cors');
const bodyParser = require('body-parser');

const app = express();
app.use(cors());
app.use(bodyParser.json());

const PORT = process.env.PORT || 3000;
const provider = new ethers.JsonRpcProvider(process.env.RPC_URL);
const wallet = new ethers.Wallet(process.env.PRIVATE_KEY, provider);

// Middleware para verificar el pago
async function verifyPayment(req, res, next) {
    const { txHash } = req.body;
    
    if (!txHash) {
        return res.status(400).json({ error: "Se requiere txHash en el cuerpo de la solicitud." });
    }

    try {
        const tx = await provider.getTransaction(txHash);
        if (!tx) {
            return res.status(404).json({ error: "Transacción no encontrada en la blockchain." });
        }

        const receipt = await tx.wait(); // Esperar a que se mine
        if (receipt.status !== 1) {
            return res.status(400).json({ error: "La transacción falló o fue revertida." });
        }

        if (tx.to.toLowerCase() !== wallet.address.toLowerCase()) {
            return res.status(403).json({ error: "La transacción no fue enviada a la dirección correcta de la API." });
        }

        next();
    } catch (error) {
        console.error("Error en verifyPayment:", error);
        res.status(500).json({ error: "Error interno al verificar la transacción." });
    }
}

// Endpoints
app.post('/balance', verifyPayment, async (req, res) => {
    try {
        const { address } = req.body;
        if (!ethers.isAddress(address)) {
            return res.status(400).json({ error: "Dirección Ethereum inválida." });
        }

        const balance = await provider.getBalance(address);
        res.json({ balance: ethers.formatEther(balance) });
    } catch (error) {
        console.error("Error en /balance:", error);
        res.status(500).json({ error: "Error al consultar el saldo." });
    }
});

app.post('/transfer', verifyPayment, async (req, res) => {
    try {
        const { to, amount } = req.body;
        
        if (!ethers.isAddress(to)) {
            return res.status(400).json({ error: "Dirección destino inválida." });
        }
        if (isNaN(amount) || Number(amount) <= 0) {
            return res.status(400).json({ error: "Monto inválido." });
        }

        const tx = await wallet.sendTransaction({
            to,
            value: ethers.parseEther(amount.toString())
        });
        
        res.json({ 
            success: true,
            txHash: tx.hash,
            message: `Transferencia de ${amount} ETH enviada.` 
        });
    } catch (error) {
        console.error("Error en /transfer:", error);
        res.status(500).json({ 
            error: "Error al realizar la transferencia.",
            details: error.message 
        });
    }
});

// Manejo de errores global
app.use((err, req, res, next) => {
    console.error("Error global:", err);
    res.status(500).json({ error: "Error interno del servidor." });
});

app.listen(PORT, () => {
    console.log(`API disponible en el puerto ${PORT}`);
});
