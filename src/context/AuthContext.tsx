import AsyncStorage from '@react-native-async-storage/async-storage';
import { jwtDecode } from 'jwt-decode';
import { createContext, useEffect, useState, ReactNode } from 'react';

interface AuthContextType {
  token: string;
  setToken: (token: string) => void;
  userId: string;
  setUserId: (userId: string) => void;
  user: any;
  setUser: (user: any) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

interface AuthProviderProps {
  children: ReactNode;
}

const AuthProvider = ({ children }: AuthProviderProps) => {
  const [token, setToken] = useState('');
  const [userId, setUserId] = useState('');
  const [user, setUser] = useState(null);

  useEffect(() => {
    const fetchUser = async () => {
      try {
        const storedToken = await AsyncStorage.getItem('authToken');
        if (storedToken) {
          const decodedToken: any = jwtDecode(storedToken);
          const userId = decodedToken.userId;
          setToken(storedToken);
          setUserId(userId);
        }
      } catch (error) {
        console.log('Error fetching user:', error);
      }
    };

    fetchUser();
  }, []);

  const logout = async () => {
    try {
      await AsyncStorage.removeItem('authToken');
      setToken('');
      setUserId('');
      setUser(null);
    } catch (error) {
      console.log('Error logging out:', error);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        token,
        setToken,
        userId,
        setUserId,
        user,
        setUser,
        logout,
      }}>
      {children}
    </AuthContext.Provider>
  );
};

export { AuthContext, AuthProvider }; 