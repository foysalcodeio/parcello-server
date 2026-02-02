const express = require("express");
const cors = require("cors");
require("dotenv").config();
const stripe = require("stripe")(process.env.PAYMENT_GATEWAY_KEY);
const admin = require("firebase-admin");

// Stripe key check
console.log(
    "Stripe key loaded:",
    process.env.PAYMENT_GATEWAY_KEY ? "YES" : "NO"
);
console.log(
    "Stripe key starts with:",
    process.env.PAYMENT_GATEWAY_KEY ?
        process.env.PAYMENT_GATEWAY_KEY.slice(0, 3) :
        "N/A"
);

const {
    MongoClient,
    ServerApiVersion,
    ObjectId
} = require("mongodb");

/* ---------- APP ---------- */
const app = express();
const port = process.env.PORT || 5000;

/* ---------- Middlewares ---------- */
app.use(cors());
app.use(express.json());

/* ---------- FIREBASE ADMIN ---------- */
const serviceAccount = require("./firebase-admin-key.json");

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
});

/* ---------- VERIFY FIREBASE TOKEN / API SECURITY ---------- */

const verifyFBToken = async (req, res, next) => {

    const authHeader = req.headers.authorization;
    if (!authHeader) {
        return res.status(401).send({
            message: 'unauthorized access'
        });
    }

    const token = authHeader.split(' ')[1];
    if (!token) {
        return res.status(401).send({
            message: 'unauthorized access'
        })
    }

    // verify the token
    try {
        const decoded = await admin.auth().verifyIdToken(token);
        console.log('decoded in the token', decoded);
        req.decoded = decoded;
        next();
    } catch (err) {
        return res.status(401).send({
            message: 'unauthorized access'
        })
    }
}

/* ---------- MongoDB ---------- */
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@emajohn-cluster.qrt35.mongodb.net/?appName=emajohn-cluster`;

const client = new MongoClient(uri, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    },
});

async function run() {
    try {
        await client.connect();
        //shell : show dbs

        const db = client.db("parcelDB"); // database name // shell : use parcelDB


        // database collection names - shell: show collections
        const userCollection = db.collection("users");
        const parcelsCollection = db.collection("parcels"); //shell : db.parcels.find()
        const paymentsCollection = db.collection("payments");
        const trackingCollection = db.collection("tracking");
        const ridersCollection = db.collection("riders");

        /* ---------- PARCEL ROUTES ---------- */
        app.post('/users', async (req, res) => {
            const email = req.body.email;
            const userExists = await userCollection.findOne({
                email
            });

            if (userExists) {
                // update last login 
                return res.status(409).send({
                    message: 'User already exists',
                    inserted: false
                });
            }
            const user = req.body;
            const result = await userCollection.insertOne(user);
            res.send({
                inserted: true,
                result
            });
        })

        // Get all parcels or by user email
        app.get("/parcels", verifyFBToken, async (req, res) => {
            try {
                const email = req.query.email;

                console.log('header request parcel directory', req.headers)

                const query = email ? {
                    created_by: email
                } : {};
                const options = {
                    sort: {
                        createdAt: -1
                    }
                };

                const parcels = await parcelsCollection.find(query, options).toArray();
                res.send(parcels);
            } catch (error) {
                console.error("Error fetching parcels:", error);
                res.status(500).send({
                    message: "Failed to fetch parcels"
                });
            }
        });

        // Get single parcel
        app.get("/parcels/:id", async (req, res) => {
            try {
                const id = req.params.id;

                if (!ObjectId.isValid(id)) {
                    return res.status(400).send({
                        message: "Invalid parcel ID"
                    });
                }

                const parcel = await parcelsCollection.findOne({
                    _id: new ObjectId(id),
                });

                if (!parcel) {
                    return res.status(404).send({
                        message: "Parcel not found"
                    });
                }

                res.send(parcel);
            } catch (error) {
                console.error("Error fetching parcel:", error);
                res.status(500).send({
                    message: "Internal Server Error"
                });
            }
        });

        // Create parcel
        app.post("/parcels", async (req, res) => {
            try {
                const newParcel = req.body;
                const result = await parcelsCollection.insertOne(newParcel);
                res.status(201).send(result);
            } catch (error) {
                console.error("Error inserting parcel:", error);
                res.status(500).send({
                    message: "Internal Server Error"
                });
            }
        });

        // Delete parcel
        app.delete("/parcels/:id", async (req, res) => {
            try {
                const id = req.params.id;

                const result = await parcelsCollection.deleteOne({
                    _id: new ObjectId(id),
                });

                if (result.deletedCount === 0) {
                    return res.status(404).send({
                        message: "Parcel not found"
                    });
                }

                res.send({
                    message: "Parcel deleted successfully"
                });
            } catch (error) {
                console.error("Error deleting parcel:", error);
                res.status(500).send({
                    message: "Delete failed"
                });
            }
        });


        app.post('/riders', async (req, res) => {
            const rider = req.body;
            const result = await ridersCollection.insertOne(rider);
            res.send({
                insertedId: result.insertedId
            });

        })

        app.get('/riders', async (req, res) => {
            try {
                const result = await ridersCollection.find().toArray();
                res.send(result);
            } catch (errror) {
                res.status(500).send({ message: "Failed to fetch riders" });
            }
        })
        
        app.get("/riders/active", async(req, res) => {
            const result = await ridersCollection.find({ status: "active" }).toArray();
            res.send(result);
        })

        
        app.get("/riders/pending", async (req, res) => {
            try {
                const pendingRiders = await ridersCollection.find({ status: "pending" }).toArray();
                res.send(pendingRiders);
            } catch (error) {
                console.error("Failed to load pending riders:", error);
                res.status(500).send({ message: "Failed to load pending riders" });
            }
        })

        app.patch("/riders/:id/status", async (req, res) => {
            const { id } = req.params;
            const { status } = req.body;
            const query = { _id: new ObjectId(id) }
            const updateDoc = {
                $set:
                {
                    status
                }
            }
            try {
                const result = await ridersCollection.updateOne(
                    query, updateDoc
                );
                res.send(result)
            } catch (err) {
                res.status(500).send({ message: "Failed to updated doc rider" })
            }
        })

        /* ---------- TRACKING ---------- */
        app.post("/tracking", async (req, res) => {
            try {
                const {
                    tracking_id,
                    parcel_id,
                    status,
                    message,
                    update_by = "",
                } = req.body;

                const log = {
                    tracking_id,
                    parcel_id: new ObjectId(parcel_id),
                    status,
                    message,
                    update_by,
                    time: new Date(),
                };

                const result = await trackingCollection.insertOne(log);

                res.send({
                    success: true,
                    insertedId: result.insertedId
                });
            } catch (error) {
                console.error("Tracking error:", error);
                res.status(500).send({
                    message: "Tracking failed"
                });
            }
        });

        /* ---------- STRIPE ---------- */
        app.post("/create-payment-intent", async (req, res) => {
            try {
                const {
                    amountInCents
                } = req.body;

                if (!amountInCents || amountInCents <= 0) {
                    return res.status(400).json({
                        message: "Invalid amount"
                    });
                }

                const paymentIntent = await stripe.paymentIntents.create({
                    amount: amountInCents,
                    currency: "usd",
                    automatic_payment_methods: {
                        enabled: true
                    },
                });

                res.json({
                    clientSecret: paymentIntent.client_secret
                });
            } catch (error) {
                console.error("Stripe Error:", error.message);
                res.status(500).json({
                    message: error.message
                });
            }
        });

        /* ---------- PAYMENTS ---------- */

        // Get payment history
        app.get("/payments", verifyFBToken, async (req, res) => {
            try {
                const userEmail = req.query.email;

                console.log('decoded from payment ', req.decoded);

                if (req.decoded.email !== userEmail) {
                    return res.status(403).send({
                        message: 'forbidden access'
                    });
                }

                const email = req.query.email;
                const query = email ? {
                    email
                } : {};
                const options = {
                    sort: {
                        paid_at: -1
                    }
                };

                const payments = await paymentsCollection.find(query, options).toArray();
                res.send(payments);

            } catch (error) {
                console.error("Error fetching payments:", error);
                res.status(500).send({
                    message: "Failed to fetch payments"
                });
            }
        });



        // Save payment
        app.post("/payments", async (req, res) => {
            try {
                const {
                    parcelId,
                    email,
                    amount,
                    paymentMethod,
                    transactionId,
                } = req.body;

                if (!ObjectId.isValid(parcelId)) {
                    return res.status(400).send({
                        message: "Invalid parcel ID"
                    });
                }

                const exists = await paymentsCollection.findOne({
                    parcelId: new ObjectId(parcelId),
                });

                if (exists) {
                    return res.status(409).send({
                        message: "Payment already exists"
                    });
                }

                await parcelsCollection.updateOne({
                    _id: new ObjectId(parcelId)
                }, {
                    $set: {
                        paymentStatus: "paid",
                        transactionId,
                        paid_at: new Date(),
                    },
                });

                const paymentDoc = {
                    parcelId: new ObjectId(parcelId),
                    email,
                    amount,
                    paymentMethod,
                    transactionId,
                    status: "succeeded",
                    paid_at: new Date(),
                };

                const result = await paymentsCollection.insertOne(paymentDoc);

                res.status(201).send({
                    insertedId: result.insertedId,
                    message: "Payment successful",
                });
            } catch (error) {
                console.error("Payment error:", error);
                res.status(500).send({
                    message: "Payment failed"
                });
            }
        });

        // MongoDB ping
        await client.db("admin").command({
            ping: 1
        });
        console.log("✅ MongoDB connected successfully");
    } finally {
        // keep connection alive
    }
}

run().catch(console.dir);

/* ---------- ROOT ---------- */
app.get("/", (req, res) => {
    res.send("Parcel server is running 🚚");
});

/* ---------- HEALTH ---------- */
app.get("/health", (req, res) => {
    res.status(200).json({
        success: true,
        message: "Server is healthy"
    });
});

/* ---------- START ---------- */
app.listen(port, () => {
    console.log(`🚀 Server running on port ${port}`);
});
