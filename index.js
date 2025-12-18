const express = require('express');
const cors = require('cors');
require('dotenv').config();
const { MongoClient, ServerApiVersion } = require('mongodb');
const app = express();
const port = process.env.PORT || 5000;

/* ---------- Middlewares ---------- */
app.use(cors());
app.use(express.json());






const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@emajohn-cluster.qrt35.mongodb.net/?appName=emajohn-cluster`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

async function run() {
  try {
    await client.connect();



    const db = client.db('parcelDB');
    const parcelsCollection = db.collection('parcels');

    app.get('/parcels', async (req, res) => {
        const parcels = await parcelsCollection.find().toArray();
        res.send(parcels);
    })
    
    app.post('/parcels', async (req, res) => {
        const newParcel = req.body;
        const result = await parcelsCollection.insertOne(newParcel);
        res.send(result);
    });

    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log("Pinged your deployment. You successfully connected to MongoDB!");
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);









/* ---------- Test Route ---------- */
app.get('/', (req, res) => {
    res.send('Parcel server is running 🚚');
});

/* ---------- Health Check ---------- */
app.get('/health', (req, res) => {
    res.status(200).json({
        success: true,
        message: 'Server is healthy'
    });
});

/* ---------- Start Server ---------- */
app.listen(port, () => {
    console.log(`🚀 Server running on port ${port}`);
});
