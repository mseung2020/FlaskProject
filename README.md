FlaskProject

수정방법
#1 
수정 완료 후

#2 
git add .

#3 
git commit -m "수정 날짜"

$4 
git push origin main

코드를 GitHub에 수정했을 때, 서버에 반영하는 방법

# 1. EC2에 접속
ssh -i mykey.pem ec2-user@<EC2 IP>

# 2. 앱 폴더로 이동
cd ~/FlaskProject

# 3. 변경 내용 내려받기
git pull origin main    

# 4. 새 의존성이 있으면 반영
source venv/bin/activate
pip install -r requirements.txt
deactivate

# 5. 서비스를 재시작하여 코드 적용
sudo systemctl restart myflask
sudo systemctl status  myflask -n 10   # 오류 없는지 확인