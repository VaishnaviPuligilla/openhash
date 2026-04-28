const { app } = require('./index');

const port = Number(process.env.PORT || 10000);

app.listen(port, () => {
  console.log(`OpenHash backend listening on port ${port}`);
});
