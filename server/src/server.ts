import 'dotenv/config';
import app from './app';

const port = process.env.PORT ? parseInt(process.env.PORT, 10) : 4000;

app.listen(port, () => {
  console.log(`API listening on http://localhost:${port}`);
});
