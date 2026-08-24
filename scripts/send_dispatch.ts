export {};

const response = await fetch("http://localhost:3000/dispatch", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    workOrderId: "WO-1842",
    status: "en_route",
    photoUrls: ["https://images.example.com/work-orders/WO-1842/storefront.jpg"],
    technician: {
      id: "tech-27",
      name: "Maya Chen",
      followUpBy: "2026-08-22T10:30:00.000Z",
    },
    subscribers: [
      { id: "store-ops", channel: "email", destination: "chenhua@changba.com" },
      { id: "customer-care", channel: "email", destination: "chenhua@changba.com" },
    ],
  }),
});

console.log(response.status, await response.json());
