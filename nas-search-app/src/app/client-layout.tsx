'use client';

import { ThemeProvider } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import { Container } from '@mui/material';
import { createTheme } from '@mui/material/styles';
import Header from '@/components/Header';

const theme = createTheme({
  palette: {
    mode: 'light',
  },
});

export default function ClientLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <Header />
      <Container maxWidth={false} sx={{ mt: 2, mb: 4 }}>
        {children}
      </Container>
    </ThemeProvider>
  );
}